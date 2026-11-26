export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const submittedPassword = typeof body.password === 'string' ? body.password : '';
    const configuredPassword =
      process.env.ADMIN_PASSWORD ||
      process.env.VITE_ADMIN_PASSWORD ||
      'hindustan@1971';

    if (submittedPassword === configuredPassword) {
      return res.status(200).json({ success: true });
    }
    return res.status(401).json({ success: false, error: 'Invalid password' });
  } catch {
    return res.status(400).json({ success: false, error: 'Invalid request' });
  }
}
