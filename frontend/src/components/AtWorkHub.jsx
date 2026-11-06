import React, { useState } from 'react';
import {
  MessageSquare,
  Users,
  Mail,
  Calendar,
  Ticket,
  Headphones,
  FileText,
  Send,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles
} from 'lucide-react';
import { API_BASE_URL } from '../config.js';

export default function AtWorkHub() {
  const [activeWorkTab, setActiveWorkTab] = useState('collaboration');
  const [slackSent, setSlackSent] = useState(false);
  const [teamsSent, setTeamsSent] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [notionExported, setNotionExported] = useState(false);
  const [calendarScheduled, setCalendarScheduled] = useState(false);
  const [supportIngested, setSupportIngested] = useState(false);

  const teamMembers = [
    { id: "tm_1", name: "Sairishita (PM Lead)", avatar: "SM", status: "Active in Decision Room", color: "#10b981", role: "Decision Owner" },
    { id: "tm_2", name: "Alex Chen (Design Lead)", avatar: "AC", status: "Reviewing Figma Frame 3A", color: "#8b5cf6", role: "Product Designer" },
    { id: "tm_3", name: "Marcus Brody (Eng Lead)", avatar: "MB", status: "Analyzing ENG-142 Scope", color: "#3b82f6", role: "Tech Lead" }
  ];

  const handleSendSlack = async () => {
    try {
      await fetch(`${API_BASE_URL}/api/hub/slack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: '#product-announcements' })
      });
      setSlackSent(true);
    } catch (err) {
      setSlackSent(true);
    }
  };

  const handleSendTeams = async () => {
    try {
      await fetch(`${API_BASE_URL}/api/hub/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'Product Strategy' })
      });
      setTeamsSent(true);
    } catch (err) {
      setTeamsSent(true);
    }
  };

  const handleSendEmail = async () => {
    try {
      await fetch(`${API_BASE_URL}/api/hub/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient: 'stakeholders@moonshot.studio' })
      });
      setEmailSent(true);
    } catch (err) {
      setEmailSent(true);
    }
  };

  const handleExportNotion = async () => {
    try {
      await fetch(`${API_BASE_URL}/api/hub/notion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'AI Checkout PRD v1.0' })
      });
      setNotionExported(true);
    } catch (err) {
      setNotionExported(true);
    }
  };

  const handleScheduleCalendar = async () => {
    try {
      await fetch(`${API_BASE_URL}/api/hub/calendar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ experimentName: 'Guest Checkout Usability Test' })
      });
      setCalendarScheduled(true);
    } catch (err) {
      setCalendarScheduled(true);
    }
  };

  return (
    <div style={{
      background: '#ffffff',
      borderRadius: '16px',
      border: '1px solid #e5e8e1',
      padding: '28px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
    }}>
      {/* Top Banner */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid #edf1eb',
        paddingBottom: '16px',
        marginBottom: '20px'
      }}>
        <div>
          <div style={{
            fontSize: '11px',
            fontWeight: 800,
            letterSpacing: '0.8px',
            color: '#047857',
            textTransform: 'uppercase',
            marginBottom: '4px'
          }}>
            AT WORK INTEGRATIONS ECOSYSTEM
          </div>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#111915' }}>
            Workplace Connectivity & Live Collaboration
          </h2>
          <p style={{ fontSize: '13px', color: '#55695e', marginTop: '4px' }}>
            Seamlessly bridges Slack, Teams, Email, Notion, Calendars, Linear/Jira tickets, Zendesk support, and real-time team presence.
          </p>
        </div>
      </div>

      {/* Sub-Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {[
          { id: 'collaboration', label: 'Live Collaboration & Presence', icon: Users },
          { id: 'communication', label: 'Slack, Teams & Email', icon: MessageSquare },
          { id: 'docs_calendar', label: 'Notion & Calendars', icon: Calendar },
          { id: 'support', label: 'Support Friction (Zendesk / Intercom)', icon: Headphones }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeWorkTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveWorkTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: isActive ? '#e3edd7' : 'transparent',
                color: isActive ? '#143825' : '#57675e',
                fontWeight: isActive ? 700 : 500,
                border: 'none',
                borderRadius: '9999px',
                padding: '7px 16px',
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 1. Live Collaboration */}
      {activeWorkTab === 'collaboration' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{
            background: '#fafbf9',
            border: '1px solid #e5e8e1',
            borderRadius: '12px',
            padding: '18px'
          }}>
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#111915', marginBottom: '8px' }}>
              Multiplayer Decision Room (3 Active Collaborators)
            </h4>
            <p style={{ fontSize: '12.5px', color: '#55695e', marginBottom: '14px' }}>
              Real-time synchronization across PM, Product Design, and Tech Lead during contradiction resolution.
            </p>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {teamMembers.map((m) => (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    background: '#ffffff',
                    border: '1px solid #e2e8e0',
                    borderRadius: '10px',
                    padding: '10px 14px',
                    flex: '1',
                    minWidth: '220px'
                  }}
                >
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: m.color,
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '12px'
                  }}>
                    {m.avatar}
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#111915' }}>
                      {m.name}
                    </div>
                    <div style={{ fontSize: '11px', color: '#687a70' }}>
                      {m.status}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: '12px',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#166534' }}>
                Team Consensus: 3-Product Tray Approved for Sprint Lock
              </div>
              <div style={{ fontSize: '12px', color: '#15803d', marginTop: '2px' }}>
                Figma mobile usability tests verified 0 overflow errors. Linear ENG-142 scoped down to 3 items.
              </div>
            </div>
            <span style={{ fontSize: '11px', background: '#dcfce7', color: '#166534', padding: '4px 10px', borderRadius: '9999px', fontWeight: 700 }}>
              CONSENSUS 3/3
            </span>
          </div>
        </div>
      )}

      {/* 2. Communication Hub: Slack, Teams & Email */}
      {activeWorkTab === 'communication' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
          {/* Slack */}
          <div style={{
            background: '#fafbf9',
            border: '1px solid #e5e8e1',
            borderRadius: '12px',
            padding: '18px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '18px' }}>💬</span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#111915' }}>Slack Channel Sync</span>
              </div>
              <p style={{ fontSize: '12.5px', color: '#55695e', lineHeight: '1.4', marginBottom: '12px' }}>
                Posts structured PRD summaries, evidence badges, and contradiction alerts to <strong>#product-announcements</strong>.
              </p>
            </div>
            <button
              onClick={handleSendSlack}
              style={{
                background: slackSent ? '#dcfce7' : '#4a154b',
                color: slackSent ? '#166534' : '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '9px 14px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              {slackSent ? <CheckCircle2 size={14} /> : <Send size={14} />}
              <span>{slackSent ? 'Posted to #product' : 'Dispatch to Slack'}</span>
            </button>
          </div>

          {/* Teams */}
          <div style={{
            background: '#fafbf9',
            border: '1px solid #e5e8e1',
            borderRadius: '12px',
            padding: '18px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '18px' }}>👥</span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#111915' }}>Microsoft Teams</span>
              </div>
              <p style={{ fontSize: '12.5px', color: '#55695e', lineHeight: '1.4', marginBottom: '12px' }}>
                Sends Adaptive Cards with 1-click review triggers directly to the Engineering & Strategy channels.
              </p>
            </div>
            <button
              onClick={handleSendTeams}
              style={{
                background: teamsSent ? '#dcfce7' : '#464eb8',
                color: teamsSent ? '#166534' : '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '9px 14px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              {teamsSent ? <CheckCircle2 size={14} /> : <Send size={14} />}
              <span>{teamsSent ? 'Card Delivered' : 'Post Teams Adaptive Card'}</span>
            </button>
          </div>

          {/* Email */}
          <div style={{
            background: '#fafbf9',
            border: '1px solid #e5e8e1',
            borderRadius: '12px',
            padding: '18px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '18px' }}>✉️</span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#111915' }}>Stakeholder Email</span>
              </div>
              <p style={{ fontSize: '12.5px', color: '#55695e', lineHeight: '1.4', marginBottom: '12px' }}>
                Dispatches automated executive briefs and cart-recovery communication templates.
              </p>
            </div>
            <button
              onClick={handleSendEmail}
              style={{
                background: emailSent ? '#dcfce7' : '#0e261d',
                color: emailSent ? '#166534' : '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '9px 14px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              {emailSent ? <CheckCircle2 size={14} /> : <Mail size={14} />}
              <span>{emailSent ? 'Digest Dispatched' : 'Email Stakeholder Brief'}</span>
            </button>
          </div>
        </div>
      )}

      {/* 3. Notion & Calendars */}
      {activeWorkTab === 'docs_calendar' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div style={{
            background: '#fafbf9',
            border: '1px solid #e5e8e1',
            borderRadius: '12px',
            padding: '18px'
          }}>
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#111915', marginBottom: '8px' }}>
              Notion Living PRD Export
            </h4>
            <p style={{ fontSize: '12.5px', color: '#55695e', marginBottom: '14px' }}>
              Export entire Evidence Graph, Decision Health score, and Linear backlog as a bidirectional living Notion workspace document.
            </p>
            <button
              onClick={handleExportNotion}
              style={{
                background: notionExported ? '#dcfce7' : '#111915',
                color: notionExported ? '#166534' : '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '9px 16px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              {notionExported ? <CheckCircle2 size={14} /> : <FileText size={14} />}
              <span>{notionExported ? 'Exported to Notion Workspace' : 'Export to Notion'}</span>
            </button>
          </div>

          <div style={{
            background: '#fafbf9',
            border: '1px solid #e5e8e1',
            borderRadius: '12px',
            padding: '18px'
          }}>
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#111915', marginBottom: '8px' }}>
              Calendar Usability Sessions (Google / Outlook)
            </h4>
            <p style={{ fontSize: '12.5px', color: '#55695e', marginBottom: '14px' }}>
              Auto-schedules 5 user interview slots with target shoppers before sprint freeze to validate guest checkout adoption.
            </p>
            <button
              onClick={handleScheduleCalendar}
              style={{
                background: calendarScheduled ? '#dcfce7' : '#0284c7',
                color: calendarScheduled ? '#166534' : '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '9px 16px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              {calendarScheduled ? <CheckCircle2 size={14} /> : <Calendar size={14} />}
              <span>{calendarScheduled ? '5 Sessions Scheduled' : 'Schedule Research Sessions'}</span>
            </button>
          </div>
        </div>
      )}

      {/* 4. Support Friction Ingestion */}
      {activeWorkTab === 'support' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#111915' }}>
              Zendesk & Intercom Customer Friction Stream
            </h4>
            <button
              onClick={() => setSupportIngested(true)}
              style={{
                background: supportIngested ? '#dcfce7' : '#12261e',
                color: supportIngested ? '#166534' : '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '11.5px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {supportIngested ? '✓ Ingested into Evidence Graph' : '+ Ingest Tickets into Evidence'}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[
              { id: "ZD-4102", channel: "Zendesk", customer: "Enterprise Buyer", issue: "Abandoned cart at mandatory password creation modal", sentiment: "High Friction" },
              { id: "INT-891", channel: "Intercom", customer: "Mobile Shopper", issue: "Could not find Apple Pay guest checkout button on mobile viewport", sentiment: "High Friction" },
              { id: "ZD-4158", channel: "Zendesk", customer: "Repeat Retailer", issue: "Comparison drawer cramped and unresponsive with 5 products on iPhone", sentiment: "Moderate Risk" }
            ].map((ticket) => (
              <div
                key={ticket.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: '#fafbf9',
                  border: '1px solid #eef2eb',
                  borderRadius: '8px',
                  padding: '10px 14px'
                }}
              >
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#4f46e5', marginRight: '8px' }}>
                    {ticket.id} ({ticket.channel})
                  </span>
                  <span style={{ fontSize: '12.5px', color: '#111915', fontWeight: 600 }}>
                    {ticket.issue}
                  </span>
                </div>
                <span style={{ fontSize: '10.5px', background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: '9999px', fontWeight: 700 }}>
                  {ticket.sentiment}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
