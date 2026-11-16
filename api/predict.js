export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const apiKey = process.env.ULTRALYTICS_API_KEY;
  const modelUrl = process.env.ULTRALYTICS_MODEL_URL;

  if (!apiKey || !modelUrl) {
    return res.status(500).json({
      error: 'Server configuration error: Missing ULTRALYTICS_API_KEY or ULTRALYTICS_MODEL_URL.',
    });
  }

  try {
    // Read raw request body as a Buffer
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const rawBody = Buffer.concat(chunks);

    // Forward the multipart/form-data request directly to Ultralytics
    const response = await fetch(modelUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': req.headers['content-type'],
      },
      body: rawBody,
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.message || 'Ultralytics API returned an error.',
        details: data,
      });
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('Inference proxy error:', error);
    return res.status(500).json({
      error: 'Failed to communicate with the inference endpoint.',
      details: error.message,
    });
  }
}