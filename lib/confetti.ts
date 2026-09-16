'use client';

const COLORS = [
  '#FF8BA7', // pink
  '#E2F0D9', // mint
  '#E6E6FA', // lavender
  '#FFF5BA', // yellow
  '#D4F0F0', // sky
  '#FFD1DC', // rose
  '#9BC5A8', // sage
  '#7FB89B', // green
];

let activeCount = 0;

export function fireConfetti(opts?: {
  count?: number;
  originX?: number;
  originY?: number;
}) {
  if (typeof window === 'undefined') return;
  if (activeCount > 300) return; // safety valve

  const count = opts?.count ?? 70;
  const originX = opts?.originX ?? window.innerWidth / 2;
  const originY = opts?.originY ?? 60;

  const root = document.createElement('div');
  root.setAttribute('data-confetti', '1');
  root.style.position = 'fixed';
  root.style.inset = '0';
  root.style.pointerEvents = 'none';
  root.style.zIndex = '9999';
  root.style.overflow = 'hidden';
  document.body.appendChild(root);

  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const size = 6 + Math.random() * 8;
    const isCircle = Math.random() > 0.65;

    const startX = originX + (Math.random() - 0.5) * 260;
    const startY = originY + (Math.random() - 0.5) * 40;

    const driftX = (Math.random() - 0.5) * 500;
    const fallY = window.innerHeight + 100 - startY;

    const duration = 1500 + Math.random() * 1300;
    const delay = Math.random() * 200;
    const rotation = (Math.random() - 0.5) * 1080;

    piece.style.position = 'absolute';
    piece.style.left = `${startX}px`;
    piece.style.top = `${startY}px`;
    piece.style.width = `${size}px`;
    piece.style.height = `${size}px`;
    piece.style.backgroundColor = color;
    piece.style.border = '2px solid black';
    piece.style.borderRadius = isCircle ? '999px' : '2px';
    piece.style.transform = 'translate(-50%, -50%) rotate(0deg)';
    piece.style.opacity = '1';
    piece.style.willChange = 'transform, opacity';

    root.appendChild(piece);
    activeCount++;

    requestAnimationFrame(() => {
      piece.style.transition = `transform ${duration}ms cubic-bezier(0.2, 0.6, 0.4, 1) ${delay}ms, opacity ${duration}ms ease-in ${delay}ms`;
      piece.style.transform = `translate(calc(-50% + ${driftX}px), calc(-50% + ${fallY}px)) rotate(${rotation}deg)`;
      piece.style.opacity = '0';
    });

    setTimeout(() => {
      piece.remove();
      activeCount--;
    }, duration + delay + 300);
  }

  setTimeout(() => {
    if (root.childElementCount === 0) root.remove();
  }, 4500);
}

export function fireConfettiAt(x: number, y: number, count: number = 40) {
  fireConfetti({ count, originX: x, originY: y });
}