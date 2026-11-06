/**
 * PMPilot Frontend Configuration
 * 
 * Supports production deployment on Vercel, containerized environments,
 * and local development with sensible fallbacks.
 */

// If VITE_API_URL is set in environment (e.g. Vercel Project Settings),
// use it stripped of any trailing slash.
// In local development or when undefined, fall back to http://localhost:4000.
export const API_BASE_URL = (
  import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== ''
    ? import.meta.env.VITE_API_URL
    : 'http://localhost:4000'
).replace(/\/+$/, '');
