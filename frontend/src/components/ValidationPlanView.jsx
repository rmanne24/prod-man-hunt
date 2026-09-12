import React from 'react';
import { Compass, CheckCircle2, AlertOctagon, ArrowUpRight } from 'lucide-react';

export default function ValidationPlanView() {
  return (
    <div style={{
      background: '#ffffff',
      borderRadius: '16px',
      border: '1px solid #e5e8e1',
      padding: '28px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
    }}>
      <div style={{
        fontSize: '11px',
        fontWeight: 800,
        letterSpacing: '0.8px',
        color: '#6d28d9',
        textTransform: 'uppercase',
        marginBottom: '4px'
      }}>
        EMPIRICAL EXPERIMENTS · RISK MITIGATION
      </div>
      <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#111915', marginBottom: '16px' }}>
        Pre-Sprint Validation Protocol
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{
          background: '#fafbf9',
          border: '1px solid #e5e8e1',
          borderRadius: '12px',
          padding: '18px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#111915' }}>
              Experiment 01: Guest Checkout Friction Test
            </span>
            <span style={{ fontSize: '11px', background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: '9999px', fontWeight: 700 }}>
              SCHEDULED (Figma)
            </span>
          </div>
          <p style={{ fontSize: '12.5px', color: '#4b5e53', lineHeight: '1.45', marginBottom: '10px' }}>
            <strong>Hypothesis:</strong> First-time mobile users convert at 62% or higher when "Continue as Guest" is positioned above the fold vs 28% for mandatory login.
          </p>
          <div style={{ fontSize: '11.5px', color: '#66786e' }}>
            <strong>Success Metric:</strong> Time to checkout completion under 45 seconds · Sample: 15 unmoderated sessions
          </div>
        </div>

        <div style={{
          background: '#fafbf9',
          border: '1px solid #e5e8e1',
          borderRadius: '12px',
          padding: '18px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#111915' }}>
              Experiment 02: Comparison Drawer Capacity (3 vs 5 Items)
            </span>
            <span style={{ fontSize: '11px', background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: '9999px', fontWeight: 700 }}>
              KILL CRITERIA ATTACHED
            </span>
          </div>
          <p style={{ fontSize: '12.5px', color: '#4b5e53', lineHeight: '1.45', marginBottom: '10px' }}>
            <strong>Hypothesis:</strong> Restricting comparison tray to 3 items reduces decision fatigue and boosts checkout rate by +9% compared to 5 items on mobile viewports.
          </p>
          <div style={{ fontSize: '11.5px', color: '#66786e' }}>
            <strong>Kill Criteria:</strong> If customer feedback demands 5 products in over 15% of sessions, schedule horizontal scrolling carousel in Sprint 2.
          </div>
        </div>
      </div>
    </div>
  );
}
