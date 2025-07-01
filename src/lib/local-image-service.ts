import { uploadImageToLocal } from './local-storage-service';

export interface ImageUploadResult {
  success: boolean;
  imageUrl?: string;
  analysis?: string;
  error?: string;
  stream?: ReadableStream<Uint8Array>;
}

// Analyze image with NVIDIA API using local image data
export async function analyzeImageWithNVIDIA(
  imageFile: File,
  userMessage: string,
  priorContext: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  options: { stream?: boolean } = {}
): Promise<ImageUploadResult> {
  try {
    // Convert image file to base64 data URL for local storage
    const uploadResult = await uploadImageToLocal(imageFile);
    if (!uploadResult.success || !uploadResult.url) {
      return { success: false, error: uploadResult.error || 'Failed to process image' };
    }

    // Prepare the image data for NVIDIA API
    const imageBase64 = uploadResult.url.split(',')[1]; // Remove data:image/...;base64, prefix
    
    const messages = [
      ...priorContext.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      {
        role: 'user' as const,
        content: [
          {
            type: 'text',
            text: userMessage || 'Please analyze this image.'
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${imageBase64}`
            }
          }
        ]
      }
    ];

    const response = await fetch('/api/nvidia', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages,
        mode: 'image_analysis',
        stream: options.stream || false
      }),
    });

    if (!response.ok) {
      throw new Error(`NVIDIA API request failed: ${response.status}`);
    }

    if (options.stream) {
      return {
        success: true,
        imageUrl: uploadResult.url,
        stream: response.body || undefined
      };
    } else {
      const data = await response.json();
      return {
        success: true,
        imageUrl: uploadResult.url,
        analysis: data.choices?.[0]?.message?.content || 'No analysis available'
      };
    }
  } catch (error) {
    console.error('Error analyzing image with NVIDIA:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export async function uploadAndAnalyzeImage(
  file: File,
  userMessage?: string
): Promise<ImageUploadResult> {
  return analyzeImageWithNVIDIA(file, userMessage || '', [], { stream: false });
} 