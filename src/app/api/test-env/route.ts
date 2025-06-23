import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Get all environment variable keys (excluding sensitive ones)
    const envKeys = Object.keys(process.env).filter(
      key => !key.includes('PASSWORD') && 
             !key.includes('SECRET') && 
             !key.includes('KEY')
    );
    
    // Check for specific keys (only checking existence, not values)
    const envStatus = {
      NVIDIA_API_KEY: !!process.env.NVIDIA_API_KEY,
      NVIDIA_API_KEY2: !!process.env.NVIDIA_API_KEY2,
      NVIDIA_API_KEY3: !!process.env.NVIDIA_API_KEY3,
      EXA_API_KEY: !!process.env.EXA_API_KEY,
      GOOGLE_VISION_API_KEY: !!process.env.GOOGLE_VISION_API_KEY,
      NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    };
    
    return NextResponse.json({
      message: 'Environment variables check',
      availableEnvKeys: envKeys,
      envStatus,
      nodeEnv: process.env.NODE_ENV,
    });
  } catch (error) {
    console.error('Error checking environment variables:', error);
    return NextResponse.json(
      { error: 'Error checking environment variables' },
      { status: 500 }
    );
  }
} 