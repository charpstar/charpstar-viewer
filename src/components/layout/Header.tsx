// src/components/layout/Header.tsx
'use client';
import React from 'react';
import Image from 'next/image';

interface HeaderProps {
  title?: string;
}

const Header: React.FC<HeaderProps> = ({ title }) => {
  return (
    <header className="h-12 bg-white text-[#111827] flex items-center px-6 border-b border-gray-200 shadow-sm w-full">
      {/* Logo only - clean and professional */}
      <div className="flex items-center">
        <Image
          src="/logo.svg"
          alt="Charpstar Logo"
          width={100}
          height={28}
        />
      </div>
    </header>
  );
};

export default Header;