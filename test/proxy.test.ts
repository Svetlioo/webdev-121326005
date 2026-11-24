import { describe, expect, test } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '../proxy';

describe('proxy', () => {
  test('AC-15 a visitor who is not signed in and opens /plans is redirected to /signin', () => {
    const response = proxy(new NextRequest('http://localhost:3000/plans'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/signin');
  });

  test('a visitor with a session cookie is let through to the page, which checks it again', () => {
    const request = new NextRequest('http://localhost:3000/plans', {
      headers: { cookie: 'better-auth.session_token=abc' },
    });
    expect(proxy(request).headers.get('location')).toBeNull();
  });
});
