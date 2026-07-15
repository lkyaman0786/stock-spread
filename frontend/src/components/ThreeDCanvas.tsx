import React, { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  z: number;
  color: string;
  size: number;
}

export const ThreeDCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Re-calculate size on resize
    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // Track mouse
    const handleMouseMove = (e: MouseEvent) => {
      // Normalize to center of screen
      mouseRef.current.targetX = (e.clientX - width / 2) * 0.15;
      mouseRef.current.targetY = (e.clientY - height / 2) * 0.15;
    };
    window.addEventListener('mousemove', handleMouseMove);

    // Build particles
    const particleCount = 120;
    const particles: Particle[] = [];
    const colors = ['#06b6d4', '#8b5cf6', '#10b981', '#ffffff'];

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: (Math.random() - 0.5) * 2000,
        y: (Math.random() - 0.5) * 2000,
        z: Math.random() * 2000,
        size: Math.random() * 2 + 1,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    const focalLength = 350;

    // Loop
    const render = () => {
      // Clear
      ctx.fillStyle = 'rgba(3, 7, 18, 0.15)'; // trails effect
      ctx.fillRect(0, 0, width, height);

      // Smooth mouse follow
      mouseRef.current.x += (mouseRef.current.targetX - mouseRef.current.x) * 0.05;
      mouseRef.current.y += (mouseRef.current.targetY - mouseRef.current.y) * 0.05;

      // Draw grid lines in 3D perspective occasionally for tech feel
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.015)';
      ctx.lineWidth = 1;
      
      // Update & Draw particles
      particles.forEach((p) => {
        // Move towards viewer
        p.z -= 2.5;

        // Reset if behind viewer
        if (p.z <= -focalLength) {
          p.z = 2000;
          p.x = (Math.random() - 0.5) * 2000;
          p.y = (Math.random() - 0.5) * 2000;
        }

        // Apply perspective projection
        const scale = focalLength / (focalLength + p.z);
        const projX = p.x * scale + width / 2 + mouseRef.current.x * (scale * 0.8);
        const projY = p.y * scale + height / 2 + mouseRef.current.y * (scale * 0.8);
        const size = p.size * scale;

        // Draw particle if on-screen
        if (projX >= 0 && projX <= width && projY >= 0 && projY <= height) {
          // Opacity decreases based on distance (z)
          const opacity = Math.min(1, (2000 - p.z) / 1000);
          ctx.beginPath();
          ctx.arc(projX, projY, size, 0, Math.PI * 2);
          
          ctx.fillStyle = p.color;
          ctx.globalAlpha = opacity * 0.7;
          ctx.fill();
        }
      });
      ctx.globalAlpha = 1.0;

      // Connect particles if they are close
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.08)';
      ctx.lineWidth = 0.5;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const p1 = particles[i];
          const p2 = particles[j];
          
          // distance calculation in 3D
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dz = p1.z - p2.z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          
          if (dist < 180) {
            const scale1 = focalLength / (focalLength + p1.z);
            const scale2 = focalLength / (focalLength + p2.z);
            
            const x1 = p1.x * scale1 + width / 2 + mouseRef.current.x * (scale1 * 0.8);
            const y1 = p1.y * scale1 + height / 2 + mouseRef.current.y * (scale1 * 0.8);
            
            const x2 = p2.x * scale2 + width / 2 + mouseRef.current.x * (scale2 * 0.8);
            const y2 = p2.y * scale2 + height / 2 + mouseRef.current.y * (scale2 * 0.8);
            
            const opacity = Math.min(0.5, (1 - dist / 180)) * Math.min((2000 - p1.z) / 1500, (2000 - p2.z) / 1500);
            
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.globalAlpha = opacity * 0.3;
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1.0;

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: -1,
        pointerEvents: 'none',
      }}
    />
  );
};
