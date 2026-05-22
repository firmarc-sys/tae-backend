/**
 * SubscriptionSelector — Tier selection overlay
 * Appears after initial onboarding before runtime activation
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  getAllTiers,
  getTierFeatures,
  getUpgradeLink,
  type SubscriptionTier,
} from '../lib/subscriptions';

interface SubscriptionSelectorProps {
  onSelect: (tier: SubscriptionTier) => void;
  currentTier?: SubscriptionTier;
}

export const SubscriptionSelector: React.FC<SubscriptionSelectorProps> = ({
  onSelect,
  currentTier = 'free',
}) => {
  const [selecting, setSelecting] = useState<SubscriptionTier | null>(null);

  const handleSelect = (tier: SubscriptionTier) => {
    if (tier === 'owner') {
      // Owner tier not selectable via UI
      return;
    }

    const features = getTierFeatures(tier);
    if (tier !== 'free' && features.stripeLink) {
      // Redirect to Stripe for payment
      setSelecting(tier);
      window.location.href = features.stripeLink;
      return;
    }

    // Free tier selected
    onSelect(tier);
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="w-full max-w-4xl px-4"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        {/* Title */}
        <div className="text-center mb-12">
          <h2 className="text-3xl font-light text-white mb-2 tracking-widest">
            SELECT YOUR ACCESS TIER
          </h2>
          <p className="text-white/50 text-sm">Choose how you want to experience SIOS</p>
        </div>

        {/* Tier cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {getAllTiers()
            .filter(tier => tier !== 'owner')
            .map((tier) => {
              const config = getTierFeatures(tier);
              const isSelected = tier === currentTier;

              return (
                <motion.button
                  key={tier}
                  onClick={() => handleSelect(tier)}
                  className={`relative p-6 rounded-lg border text-left transition-all ${
                    isSelected
                      ? 'border-cyan-400 bg-cyan-400/10'
                      : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                  }`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  disabled={selecting === tier}
                >
                  {/* Tier name and price */}
                  <div className="mb-4">
                    <h3 className="text-xl font-semibold text-white">{config.name}</h3>
                    {config.price ? (
                      <p className="text-cyan-300 text-lg mt-1">
                        ${config.price}
                        <span className="text-xs text-white/50 ml-1">/lifetime</span>
                      </p>
                    ) : (
                      <p className="text-white/50 text-sm mt-1">Free forever</p>
                    )}
                  </div>

                  {/* Features */}
                  <div className="space-y-2 mb-6">
                    {config.features.slice(0, 4).map((feature, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 text-sm text-white/70"
                      >
                        <span className="text-cyan-300 mt-0.5">◆</span>
                        <span>{feature}</span>
                      </div>
                    ))}
                    {config.features.length > 4 && (
                      <p className="text-xs text-white/40 pt-2">
                        +{config.features.length - 4} more features
                      </p>
                    )}
                  </div>

                  {/* CTA button */}
                  <button
                    className={`w-full py-2 rounded text-xs font-mono uppercase tracking-wider transition ${
                      isSelected
                        ? 'bg-cyan-400/20 text-cyan-300 border border-cyan-400'
                        : 'bg-white/5 text-white/70 border border-white/10 hover:bg-white/10 hover:text-white'
                    }`}
                    disabled={selecting === tier}
                  >
                    {selecting === tier ? 'Redirecting...' : tier === 'free' ? 'Select' : 'Upgrade'}
                  </button>
                </motion.button>
              );
            })}
        </div>

        {/* Info footer */}
        <div className="text-center text-xs text-white/40 space-y-1">
          <p>All tiers include identity rendering and persistent session</p>
          <p>You can change tiers anytime • Stripe-secured payments</p>
        </div>
      </motion.div>
    </motion.div>
  );
};
