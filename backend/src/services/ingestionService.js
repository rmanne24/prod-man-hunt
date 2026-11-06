/**
 * PMPilot Shared Evidence Ingestion Pipeline
 * 
 * Implements:
 * - Shared ingestion pipeline across all integrations
 * - Record deduplication by (workspaceId, provider, externalId)
 * - Metadata, author, source URL, and timestamp preservation
 * - Safe transition of imported records into reviewable decision signals
 * - Epistemic classification: Imported records start as UNVERIFIED evidence
 * - Clear distinction between imported source material, claims, verified evidence,
 *   and human-approved decisions.
 */

import { db } from '../db/database.js';
import { RedisStateManager } from './redisState.js';
import { MozillaTrustEngine } from './mozillaTrust.js';

export class IngestionService {
  /**
   * Ingests an external record into the workspace repository with deduplication
   */
  ingestRecord({
    workspaceId,
    provider,
    externalId,
    sourceUrl = null,
    title,
    content,
    contentType,
    author = null,
    originalCreatedAt = null,
    originalUpdatedAt = null,
    metadata = {}
  }) {
    if (!workspaceId || !provider || !externalId || !title) {
      throw new Error('workspaceId, provider, externalId, and title are required for evidence ingestion.');
    }

    // Clean content using MozillaTrustEngine to sanitize malformed or malicious text
    const cleanedContent = MozillaTrustEngine.cleanContent(content || '');

    const record = db.saveImportedRecord({
      workspaceId,
      provider: provider.toUpperCase(),
      externalId: String(externalId),
      sourceUrl,
      title: title.trim(),
      content: cleanedContent,
      contentType: contentType || 'DOCUMENT',
      author,
      originalCreatedAt,
      originalUpdatedAt,
      syncState: 'IMPORTED',
      metadata
    });

    return record;
  }

  /**
   * Batch ingests multiple records for an integration sync run
   */
  batchIngest(records = []) {
    const results = [];
    for (const rec of records) {
      try {
        const saved = this.ingestRecord(rec);
        results.push(saved);
      } catch (err) {
        console.error(`[IngestionService] Failed to ingest record ${rec.externalId}:`, err.message);
      }
    }
    return results;
  }

  /**
   * Lists imported records for review by product managers
   */
  listRecords({ workspaceId, provider = null, limit = 50, offset = 0 }) {
    if (!workspaceId) return { records: [], total: 0 };
    const provFilter = provider ? provider.toUpperCase() : null;
    const records = db.listImportedRecords(workspaceId, provFilter, limit, offset);
    const total = db.countImportedRecords(workspaceId, provFilter);
    return { records, total };
  }

  /**
   * Promotes an imported record into a reviewable PMPilot Decision Signal
   * Note: The imported signal remains UNVERIFIED until explicitly reviewed by a PM.
   */
  async promoteRecordToDecisionSignal({
    workspaceId,
    recordId,
    decisionId,
    category = 'FEATURE_REQUEST',
    underlyingCustomerProblem = null,
    reviewedBy = null
  }) {
    if (!workspaceId || !recordId || !decisionId) {
      throw new Error('workspaceId, recordId, and decisionId are required to attach evidence to a decision.');
    }

    const record = db.getImportedRecordById(workspaceId, recordId);
    if (!record) {
      throw new Error(`Imported record '${recordId}' not found in workspace '${workspaceId}'.`);
    }

    // Construct Signal with complete provenance
    const signalData = {
      source: `${record.provider}: ${record.title}`,
      sourceType: record.provider,
      url: record.source_url,
      rawText: record.content,
      capturedBy: reviewedBy || record.author || `${record.provider} Ingestion`,
      category: category || 'FEATURE_REQUEST',
      underlyingCustomerProblem: underlyingCustomerProblem || null,
      verificationStatus: 'UNVERIFIED', // PM must review before it is verified
      metadata: {
        importedRecordId: record.id,
        externalId: record.external_id,
        originalCreatedAt: record.original_created_at,
        originalUpdatedAt: record.original_updated_at,
        importedAt: record.imported_at
      }
    };

    const updatedDecision = await RedisStateManager.ingestSignal(decisionId, signalData);

    // Update imported record state to LINKED_TO_DECISION
    db.updateImportedRecordSyncState(workspaceId, recordId, 'LINKED_TO_DECISION');

    return {
      success: true,
      decision: updatedDecision,
      recordId: record.id,
      syncState: 'LINKED_TO_DECISION'
    };
  }
}

export const ingestionService = new IngestionService();
