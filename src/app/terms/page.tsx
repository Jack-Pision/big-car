'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

export default function TermsOfUsePage() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-neutral-100">
      {/* Background Pattern */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-neutral-800/20 via-neutral-900/15 to-black/25"></div>
        <div 
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255, 255, 255, 0.08) 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px'
          }}
        ></div>
      </div>

      {/* Header */}
      <div className="relative z-10 border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link 
                href="/"
                className="flex items-center gap-2 text-neutral-400 hover:text-neutral-200 transition-colors"
              >
                <ArrowLeft size={20} />
                <span className="text-sm font-medium">Back to App</span>
              </Link>
            </div>
            <div className="flex items-center gap-3">
              <Image 
                src="/Logo.svg" 
                alt="Tehom AI" 
                width={40} 
                height={40} 
                className="text-neutral-100" 
              />
              <span className="text-lg font-semibold text-neutral-100">Tehom AI</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 max-w-4xl mx-auto px-6 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="prose prose-invert max-w-none"
        >
          {/* Title */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-neutral-100 mb-4 tracking-tight">
              Terms of Use
            </h1>
            <p className="text-neutral-400 text-lg">
              Tehom AI
            </p>
            <div className="mt-4 text-sm text-neutral-500">
              <p><strong>Effective Date:</strong> July 2, 2025</p>
              <p><strong>Last Updated:</strong> July 2, 2025</p>
            </div>
          </div>

          {/* Terms Content */}
          <div className="space-y-8 text-neutral-300 leading-relaxed">
            <section>
              <h2 className="text-2xl font-semibold text-neutral-100 mb-4">1. Acceptance of Terms</h2>
              <p className="text-base leading-7">
                By accessing or using Tehom AI ("the Service," "the App," or "our platform"), you agree to be bound by these Terms of Use ("Terms"). If you do not agree to these Terms, please do not use our Service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-neutral-100 mb-4">2. Description of Service</h2>
              <p className="text-base leading-7 mb-4">
                Tehom AI is an artificial intelligence platform designed to provide:
              </p>
              <ul className="list-disc list-inside space-y-2 text-base leading-7 ml-4">
                <li>Intelligent agent task handling and automation</li>
                <li>Interactive chatbot conversations and assistance</li>
                <li>General-purpose AI tools and capabilities</li>
                <li>Productivity and workflow enhancement features</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-neutral-100 mb-4">3. Data Ownership and Privacy</h2>
              
              <h3 className="text-xl font-medium text-neutral-100 mb-3">Your Data Rights</h3>
              <ul className="list-disc list-inside space-y-2 text-base leading-7 ml-4 mb-6">
                <li><strong>You own your data.</strong> All content, conversations, files, and information you provide to Tehom AI remain your property.</li>
                <li>We do not claim ownership over any data you input, generate, or store through our Service.</li>
                <li>Your data is yours to export, delete, or transfer at any time.</li>
              </ul>

              <h3 className="text-xl font-medium text-neutral-100 mb-3">Our Privacy Commitment</h3>
              <ul className="list-disc list-inside space-y-2 text-base leading-7 ml-4 mb-6">
                <li>We prioritize your privacy above all else.</li>
                <li>We do not store, retain, or analyze your personal conversations or data beyond what is necessary for immediate service functionality.</li>
                <li>We do not sell, share, or monetize your personal information.</li>
                <li>We implement industry-standard security measures to protect your data during transmission and any temporary processing.</li>
              </ul>

              <h3 className="text-xl font-medium text-neutral-100 mb-3">Data Processing</h3>
              <ul className="list-disc list-inside space-y-2 text-base leading-7 ml-4">
                <li>Data processing occurs in real-time for service functionality only.</li>
                <li>We do not maintain persistent storage of your conversations or personal information.</li>
                <li>Any temporary data required for processing is automatically deleted upon session completion.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-neutral-100 mb-4">4. User Responsibilities</h2>
              
              <h3 className="text-xl font-medium text-neutral-100 mb-3">Acceptable Use</h3>
              <p className="text-base leading-7 mb-4">
                You agree to use Tehom AI responsibly and in compliance with all applicable laws. You will not:
              </p>
              <ul className="list-disc list-inside space-y-2 text-base leading-7 ml-4 mb-6">
                <li>Use the Service for illegal, harmful, or malicious purposes</li>
                <li>Attempt to reverse engineer, hack, or compromise the Service</li>
                <li>Share access credentials with unauthorized parties</li>
                <li>Generate content that violates intellectual property rights</li>
                <li>Use the Service to create spam, malware, or other harmful content</li>
              </ul>

              <h3 className="text-xl font-medium text-neutral-100 mb-3">Content Guidelines</h3>
              <ul className="list-disc list-inside space-y-2 text-base leading-7 ml-4">
                <li>You are responsible for all content you input into the Service</li>
                <li>You must have appropriate rights to any data you provide</li>
                <li>You agree not to input confidential information belonging to third parties without authorization</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-neutral-100 mb-4">5. Service Availability</h2>
              <ul className="list-disc list-inside space-y-2 text-base leading-7 ml-4">
                <li>We strive to maintain high service availability but cannot guarantee uninterrupted access</li>
                <li>We reserve the right to perform maintenance, updates, or improvements that may temporarily affect service availability</li>
                <li>We are not liable for any disruptions to your use of the Service</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-neutral-100 mb-4">6. Intellectual Property</h2>
              
              <h3 className="text-xl font-medium text-neutral-100 mb-3">Our Rights</h3>
              <ul className="list-disc list-inside space-y-2 text-base leading-7 ml-4 mb-6">
                <li>Tehom AI retains ownership of the platform, underlying technology, and proprietary algorithms</li>
                <li>Our trademarks, logos, and branding materials are protected intellectual property</li>
              </ul>

              <h3 className="text-xl font-medium text-neutral-100 mb-3">Your Rights</h3>
              <ul className="list-disc list-inside space-y-2 text-base leading-7 ml-4">
                <li>You retain all rights to content you create using our Service</li>
                <li>We do not claim ownership over outputs generated through your use of the platform</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-neutral-100 mb-4">7. Disclaimers and Limitations</h2>
              
              <h3 className="text-xl font-medium text-neutral-100 mb-3">Service Disclaimer</h3>
              <ul className="list-disc list-inside space-y-2 text-base leading-7 ml-4 mb-6">
                <li>Tehom AI is provided "as is" without warranties of any kind</li>
                <li>We do not guarantee the accuracy, completeness, or reliability of AI-generated content</li>
                <li>Users should verify important information and use their judgment when relying on AI outputs</li>
              </ul>

              <h3 className="text-xl font-medium text-neutral-100 mb-3">Limitation of Liability</h3>
              <ul className="list-disc list-inside space-y-2 text-base leading-7 ml-4">
                <li>Our liability is limited to the maximum extent permitted by law</li>
                <li>We are not responsible for decisions made based on AI-generated content</li>
                <li>Users assume responsibility for how they use and implement AI-generated outputs</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-neutral-100 mb-4">8. Account Management</h2>
              
              <h3 className="text-xl font-medium text-neutral-100 mb-3">Account Creation</h3>
              <ul className="list-disc list-inside space-y-2 text-base leading-7 ml-4 mb-6">
                <li>You may be required to create an account to access certain features</li>
                <li>You are responsible for maintaining the security of your account credentials</li>
                <li>You must provide accurate information during account registration</li>
              </ul>

              <h3 className="text-xl font-medium text-neutral-100 mb-3">Account Termination</h3>
              <ul className="list-disc list-inside space-y-2 text-base leading-7 ml-4">
                <li>You may delete your account at any time</li>
                <li>We reserve the right to suspend accounts that violate these Terms</li>
                <li>Upon account deletion, your data will be permanently removed from our systems</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-neutral-100 mb-4">9. Updates and Changes</h2>
              
              <h3 className="text-xl font-medium text-neutral-100 mb-3">Terms Updates</h3>
              <ul className="list-disc list-inside space-y-2 text-base leading-7 ml-4 mb-6">
                <li>We may update these Terms periodically to reflect changes in our Service or legal requirements</li>
                <li>Material changes will be communicated through the Service or via email</li>
                <li>Continued use after changes constitutes acceptance of updated Terms</li>
              </ul>

              <h3 className="text-xl font-medium text-neutral-100 mb-3">Service Changes</h3>
              <ul className="list-disc list-inside space-y-2 text-base leading-7 ml-4">
                <li>We may modify, enhance, or discontinue features of the Service</li>
                <li>We will provide reasonable notice of significant changes that affect core functionality</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-neutral-100 mb-4">10. Contact and Support</h2>
              <p className="text-base leading-7 mb-4">
                For questions about these Terms or our Service, please contact us at:
              </p>
              <ul className="list-disc list-inside space-y-2 text-base leading-7 ml-4">
                <li><strong>Email:</strong> jackpishon@gmail.com</li>
                <li><strong>Support:</strong> jackpishon@gmail.com</li>
                <li><strong>Website:</strong> big-car.vercel.app</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-neutral-100 mb-4">11. Governing Law</h2>
              <p className="text-base leading-7">
                These Terms are governed by United States law. Any disputes will be resolved in the courts of the United States.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-neutral-100 mb-4">12. Severability</h2>
              <p className="text-base leading-7">
                If any provision of these Terms is found to be unenforceable, the remaining provisions will continue in full force and effect.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-neutral-100 mb-4">13. Entire Agreement</h2>
              <p className="text-base leading-7">
                These Terms constitute the complete agreement between you and Tehom AI regarding your use of the Service.
              </p>
            </section>

            {/* Footer */}
            <div className="mt-12 pt-8 border-t border-neutral-800 text-center">
              <p className="text-neutral-400 text-sm">
                <strong>By using Tehom AI, you acknowledge that you have read, understood, and agree to be bound by these Terms of Use.</strong>
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
} 