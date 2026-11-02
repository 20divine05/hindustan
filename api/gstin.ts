export default async function handler(req: any, res: any) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, x-api-key'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { gstin } = req.query;
  if (!gstin || typeof gstin !== 'string') {
    return res.status(400).json({ success: false, error: 'Valid GSTIN parameter is required' });
  }

  const cleanGstin = gstin.trim().toUpperCase();
  const apiKey = process.env.GSTIN_API_KEY || 'gak_d8708a67ae8f44ca9b09f11d602c9041';

  try {
    const apiRes = await fetch(`https://www.gstinapi.in/v1/gstin/${cleanGstin}`, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Accept': 'application/json'
      }
    });

    const data = await apiRes.json();
    return res.status(apiRes.status).json(data);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Error communicating with GSTIN API'
    });
  }
}

