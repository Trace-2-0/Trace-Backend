import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '10s', target: 15 }, // Ramp up to 15 VUs
    { duration: '20s', target: 30 }, // Sustained peak load of 30 VUs
    { duration: '5s', target: 0 },   // Ramp down to 0 VUs
  ],
  thresholds: {
    http_req_duration: ['p(95)<300'], // Goal: p95 latency < 300ms on local machine
    http_req_failed: ['rate<0.01'],    // Goal: < 1% error rate
  },
};

// Target URL: Localhost Express Backend
const BASE_URL = __ENV.TARGET_URL || 'http://localhost:4000/api';

// 1. Setup Stage: Log in ONCE as Company Admin to get valid JWT token
export function setup() {
  const loginPayload = JSON.stringify({
    email: 'admin@benchmark.com',
    password: 'pass12345',
  });

  const res = http.post(`${BASE_URL}/auth/company/login`, loginPayload, {
    headers: { 'Content-Type': 'application/json' },
  });

  if (res.status !== 200) {
    console.error('Setup Login Failed:', res.status, res.body);
    return { token: null };
  }

  return { token: res.json('token') };
}

// 2. Main Iteration Loop: Stress test DB stats endpoint with authenticated JWT token
export default function (data) {
  if (!data.token) {
    console.error('No JWT token available from setup');
    return;
  }

  const authHeaders = {
    headers: {
      Authorization: `Bearer ${data.token}`,
      'Content-Type': 'application/json',
    },
  };

  // Heavy DB Benchmark: GET /api/company/dashboard/stats (SQL Join over 50 users & 500 shifts)
  const statsRes = http.get(`${BASE_URL}/company/dashboard/stats`, authHeaders);
  check(statsRes, {
    'dashboard stats status 200': (r) => r.status === 200,
    'total employees is 50': (r) => r.json('totalEmployees') >= 50,
  });

  sleep(0.5);
}
