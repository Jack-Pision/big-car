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
            content: `You are Tehom AI, a helpful and intelligent assistant who provides direct, clear answers without showing your thinking process.\n\nIMPORTANT: Do NOT show your internal reasoning, analysis, or thought process. Give direct answers only.\n\nYour response style:\n- Provide clear, direct answers immediately\n- Skip explanations of how you arrived at the answer\n- Do not show step-by-step reasoning or analysis\n- Be concise and to the point\n- Answer the question directly without preamble\n\nYour tone is friendly and helpful, but focused on giving the answer the user needs without extra explanation.\n\nUse markdown formatting naturally:\n- **Bold** for important terms\n- *Italics* for emphasis\n- Bullet points for lists\n- Code blocks for technical content\n- Keep formatting simple and clean\n\nBe conversational but direct - answer first, elaborate only if specifically asked.`
          },
          {
            role: 'user',
            content: `<img src="data:${mimeType};base64,${base64}" /> I can see this image you've shared. Please describe it using the same guidelines as text chat. Avoid raw bullet-dash lists; write in paragraphs or numbered points with proper spacing.`
          }
        ],
        mode: 'image_analysis',
        temperature: 0.3,
        max_tokens: 1000,
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
export async function uploadAndAnalyzeImage(file: File): Promise<ImageUploadResult> {
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
    const analysisResult = await analyzeImageWithNVIDIA(file);
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