// src/components/layout/Header.tsx
'use client';
import React from 'react';
import Image from 'next/image';

interface HeaderProps {
  title?: string;
}

const Header: React.FC<HeaderProps> = ({ title }) => {
  return (
    <header className="h-12 bg-white text-[#111827] flex items-center justify-center px-6 border-b border-gray-200 shadow-sm w-full relative">
      {/* Logo on the left */}
      <div className="absolute left-6">
        <Image
          src="/logo.svg"
          alt="Charpstar Logo"
          width={100}
          height={28}
        />
      </div>
      
      {/* Centered title */}
      {title && (
        <div className="text-lg font-bold text-gray-800">
          {title}
        </div>
      )}
    </header>
  );
};

export default Header;