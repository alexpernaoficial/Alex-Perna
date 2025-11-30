import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  isActive: boolean;
  audioLevel: number; // 0 to 1
}

export const Visualizer: React.FC<VisualizerProps> = ({ isActive, audioLevel }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let phase = 0;

    const render = () => {
      // Resize handling
      if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
      }

      const { width, height } = canvas;
      const centerX = width / 2;
      const centerY = height / 2;
      
      ctx.clearRect(0, 0, width, height);

      // Base circle radius
      const baseRadius = 50;
      // Pulse effect based on audio level or idle breathing
      const pulse = isActive 
        ? audioLevel * 100 
        : Math.sin(phase * 0.05) * 5; 

      const radius = baseRadius + pulse;

      // Draw Glow
      const gradient = ctx.createRadialGradient(centerX, centerY, radius * 0.5, centerX, centerY, radius * 2);
      if (isActive) {
        // Active speaking/listening color (Purple/Blue mix)
        gradient.addColorStop(0, 'rgba(139, 92, 246, 0.8)'); // Violet 500
        gradient.addColorStop(0.5, 'rgba(59, 130, 246, 0.4)'); // Blue 500
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      } else {
        // Idle color (Cyan/Teal)
        gradient.addColorStop(0, 'rgba(20, 184, 166, 0.4)'); // Teal 500
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      }

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * 2, 0, Math.PI * 2);
      ctx.fill();

      // Draw Core
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = isActive ? '#fff' : 'rgba(255,255,255,0.5)';
      ctx.fill();

      // Orbital Rings (Cosmetic Tech Feel)
      ctx.strokeStyle = isActive ? 'rgba(167, 139, 250, 0.3)' : 'rgba(45, 212, 191, 0.1)';
      ctx.lineWidth = 2;
      
      // Ring 1
      ctx.beginPath();
      ctx.ellipse(centerX, centerY, radius * 1.5, radius * 1.5 * 0.4, phase * 0.01, 0, Math.PI * 2);
      ctx.stroke();

      // Ring 2
      ctx.beginPath();
      ctx.ellipse(centerX, centerY, radius * 1.8, radius * 1.8 * 0.8, -phase * 0.015, 0, Math.PI * 2);
      ctx.stroke();

      phase += 1 + (isActive ? audioLevel * 10 : 0);
      animationId = requestAnimationFrame(render);
    };

    render();

    return () => cancelAnimationFrame(animationId);
  }, [isActive, audioLevel]);

  return (
    <canvas 
      ref={canvasRef} 
      className="w-full h-full block"
    />
  );
};