import fetch from 'node-fetch';

const BASE_URL = 'http://127.0.0.1:3000';
const API_URL = `${BASE_URL}/api`;

async function main() {
  console.log('Testing API endpoints...');

  // 1. Meta (Public)
  console.log('\n--- Testing GET /api/meta ---');
  try {
    const res = await fetch(`${API_URL}/meta`);
    const data = await res.json();
    console.log('Status:', res.status);
    console.log('Data:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Failed to fetch meta:', err);
  }

  // 2. Login (to get token)
  console.log('\n--- Testing POST /api/auth/login ---');
  let token = '';
  let userId = '';
  try {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-server-token': 'dev123'
      },
      body: JSON.stringify({
        email: 'user@example.com', // Assuming this user exists from migration
        password: 'password123'    // Assuming this is the password (or I might need to register first if hash mismatch)
      })
    });
    
    // If migration script created user with specific password, we need to know it.
    // The migration script uses data from users.json. 
    // If login fails, I will try to register a new user.
    
    if (res.status === 401) {
        console.log('Login failed (expected if password hash mismatch from migration). Trying Register...');
        const regRes = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'x-server-token': 'dev123'
            },
            body: JSON.stringify({
              username: 'TestUser',
              email: 'test@example.com',
              password: 'password123'
            })
          });
          const regData = await regRes.json();
          console.log('Register Status:', regRes.status);
          if (regRes.ok) {
              token = regData.token;
              userId = regData.user.id;
              console.log('Registered successfully. Token acquired.');
          } else {
              console.error('Register failed:', regData);
          }
    } else {
        const data = await res.json();
        console.log('Status:', res.status);
        if (res.ok) {
            token = data.token;
            userId = data.user.id;
            console.log('Login successful. Token acquired.');
        } else {
            console.log('Login failed:', data);
        }
    }

  } catch (err) {
    console.error('Failed to login:', err);
  }

  if (!token) {
    console.error('No token acquired. Skipping authenticated requests.');
    return;
  }

  // 3. Get Profile
  console.log('\n--- Testing GET /api/rss/profile ---');
  try {
    // Note: The auth middleware might expect 'Authorization: Bearer <token>' or 'x-auth-token'
    // Checking auth.ts... verifyToken is exported but used in middleware?
    // Wait, auth.ts doesn't show middleware usage. Let's check server.ts again or how auth is applied.
    // server.ts imports verifyToken but I need to see how it's used in routes.
    // Ah, I missed checking how `req.user` is populated. 
    // Usually it's a middleware. 
    // Let's assume standard Bearer token for now, or check usage in rss.ts
    // rss.ts: `const userId = String((req as any)?.user?.id || '');`
    
    // I'll check server.ts again to see if there is a global auth middleware.
    // If not, I might need to check if I missed migrating middleware.
    
    const res = await fetch(`${API_URL}/rss/profile`, {
      headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
    });
    const data = await res.json();
    console.log('Status:', res.status);
    console.log('Data:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Failed to fetch profile:', err);
  }

}

main();
