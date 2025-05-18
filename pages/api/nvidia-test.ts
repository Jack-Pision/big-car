import type { NextApiRequest, NextApiResponse } from 'next';
import * as NextConnect from 'next-connect';
const nextConnect = (NextConnect as any).default || NextConnect;
import multer from 'multer';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';

const upload = multer({ dest: '/tmp' });

const handler = nextConnect();

handler.use((req: NextApiRequest, res: NextApiResponse, next: any) => {
  console.log('API hit:', req.method, req.url, req.headers['content-type']);
  next();
});

handler.use(upload.single('image'));

handler.post(async (req: NextApiRequest & { file?: Express.Multer.File }, res: NextApiResponse) => {
  try {
    // Handle JSON (text chat) requests
    if (req.headers['content-type']?.includes('application/json')) {
      let body = '';
      await new Promise((resolve) => {
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', resolve);
      });
      if (!body) {
        console.error('Empty request body');
        return res.status(400).json({ error: 'Empty request body' });
      }
      let messages;
      try {
        ({ messages } = JSON.parse(body));
      } catch (e) {
        console.error('Invalid JSON:', body);
        return res.status(400).json({ error: 'Invalid JSON' });
      }
      if (!messages) {
        console.error('Missing messages in request');
        return res.status(400).json({ error: 'Missing messages in request' });
      }
      const apiKey = process.env.NVIDIA_IMAGE_API_KEY || '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';
      const apiEndpoint = 'https://integrate.api.nvidia.com/v1/chat/completions';
      const payload = {
        model: 'nvidia/llama-3.1-nemotron-ultra-253b-v1',
        messages,
        temperature: 0.6,
        top_p: 0.95,
        max_tokens: 4096,
        stream: false,
      };
      const response = await axios.post(apiEndpoint, payload, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });
      return res.status(200).json(response.data);
    }

    // Handle multipart/form-data (image upload) requests
    const { model = 'google/gemma-3-27b-it', messages, max_tokens = 512, temperature = 0.2, top_p = 0.8, stream = false } = req.body;
    const apiKey = process.env.NVIDIA_IMAGE_API_KEY || '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';
    const apiEndpoint = 'https://integrate.api.nvidia.com/v1/chat/completions';

    const formData = new FormData();
    if (req.file?.path) {
      formData.append('file', fs.createReadStream(req.file.path), req.file.originalname);
    }
    formData.append('model', model);
    formData.append('messages', messages);
    formData.append('max_tokens', max_tokens);
    formData.append('temperature', temperature);
    formData.append('top_p', top_p);
    formData.append('stream', stream);

    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      ...formData.getHeaders(),
    };

    const response = await axios.post(apiEndpoint, formData, { headers });
    res.status(200).json(response.data);
  } catch (error) {
    let details = (error as any).response?.data;
    if (!details) {
      details = (error as any).toString();
    }
    console.error('NVIDIA API error:', details);
    res.status(500).json({ error: (error as any).message, details });
  } finally {
    // Clean up the uploaded file
    if (req.file?.path) {
      fs.unlink(req.file.path, () => {});
    }
  }
});

handler.get((req: NextApiRequest, res: NextApiResponse) => {
  res.status(200).json({ status: "ok" });
});

handler.all((req: NextApiRequest, res: NextApiResponse) => {
  res.status(405).json({ error: "Method not allowed" });
});

export const config = {
  api: {
    bodyParser: false,
  },
};

export default handler; 