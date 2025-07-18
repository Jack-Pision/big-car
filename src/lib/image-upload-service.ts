import { supabase } from './auth';
import { v4 as uuidv4 } from 'uuid';

export interface ImageUploadResult {
  success: boolean;
  imageUrl?: string;
  analysis?: string;
  error?: string;
}

// Upload image to Supabase storage
export async function uploadImageToSupabase(file: File): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    // Generate unique filename
    const fileExtension = file.name.split('.').pop() || 'jpg';
    const fileName = `${user.id}/${uuidv4()}.${fileExtension}`;

    // Upload to Supabase storage
    const { data, error } = await supabase.storage
      .from('images')
      .upload(fileName, file);

    if (error) {
      console.error('Error uploading image:', error);
      return { success: false, error: error.message };
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('images')
      .getPublicUrl(fileName);

    return { success: true, url: publicUrl };
  } catch (error) {
    console.error('Error in uploadImageToSupabase:', error);
    return { success: false, error: 'Failed to upload image' };
  }
}

// Analyze image using NVIDIA API with Mistral model
export async function analyzeImageWithNVIDIA(
  file: File, 
  userMessage: string,
  previousMessages: { role: 'user' | 'assistant'; content: string }[] = [],
  options: { stream?: boolean } = {}
): Promise<{ success: boolean; analysis?: string; error?: string; stream?: ReadableStream | null }> {
  try {
    // Convert file to base64
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = file.type;

    const response = await fetch('/api/nvidia', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: `You are Tehom AI, an advanced and thoughtful assistant designed to provide dynamic, adaptive responses.
            Your personality is friendly yet intelligent, approachable yet knowledgeable. Always use markdown for output.
            
            When analyzing images, provide comprehensive, well-formatted markdown responses that include:
            - Clear description of what you observe
            - Key insights or analysis points
            - Relevant context or explanations
            - Actionable information when applicable
            - Whenever you include a mathematical expression, wrap it in inline \$ ... \$ (or \\( ... \\)) delimiters, and use \$\$ ... \$\$ (or \\[ ... \\]) for display equations so they render correctly.
            
            Always maintain a conversational yet informative tone while ensuring your response is visually appealing and easy to read.`
          },
          // Include any prior context messages
          ...previousMessages.map(msg => ({ role: msg.role, content: msg.content })),
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: userMessage
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64}`
                }
              }
            ]
          }
        ],
        mode: 'image_analysis',
        temperature: 1.00,
        top_p: 0.01,
        max_tokens: 1024,
        stream: true
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('NVIDIA API error:', errorText);
      return { success: false, error: `API request failed: ${response.status}` };
    }

    if (options.stream) {
      return { success: true, stream: response.body };
    }

    const data = await response.json();
    
    if (data.error) {
      return { success: false, error: data.error };
    }

    const analysis = data.choices?.[0]?.message?.content || 'No analysis available';
    return { success: true, analysis };
  } catch (error) {
    console.error('Error analyzing image:', error);
    return { success: false, error: 'Failed to analyze image' };
  }
}

// Complete image upload and analysis workflow
export async function uploadAndAnalyzeImage(file: File, userMessage: string): Promise<ImageUploadResult> {
  try {
    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return { success: false, error: 'Unsupported file type. Please use JPEG, PNG, GIF, or WebP.' };
    }

    // Validate file size (50MB limit)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      return { success: false, error: 'File too large. Maximum size is 50MB.' };
    }

    // Upload image
    const uploadResult = await uploadImageToSupabase(file);
    if (!uploadResult.success || !uploadResult.url) {
      return { success: false, error: uploadResult.error || 'Failed to upload image' };
    }

    // Analyze image
    const analysisResult = await analyzeImageWithNVIDIA(file, userMessage);
    if (!analysisResult.success) {
      // Return partial success - image uploaded but analysis failed
      return { 
        success: true, 
        imageUrl: uploadResult.url, 
        analysis: 'Image uploaded successfully, but analysis failed: ' + analysisResult.error,
        error: analysisResult.error 
      };
    }

    return {
      success: true,
      imageUrl: uploadResult.url,
      analysis: analysisResult.analysis
    };
  } catch (error) {
    console.error('Error in uploadAndAnalyzeImage:', error);
    return { success: false, error: 'Failed to process image' };
  }
} 