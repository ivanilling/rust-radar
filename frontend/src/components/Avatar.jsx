import { useState } from 'react';
import { User } from 'lucide-react';

/** Аватар с фолбэком-иконкой, если картинка не загрузилась. */
export default function Avatar({ src, className = '' }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <div className={`flex items-center justify-center bg-panel2 text-ghost ${className}`}>
        <User size={20} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className={className}
      onError={() => setBroken(true)}
    />
  );
}
