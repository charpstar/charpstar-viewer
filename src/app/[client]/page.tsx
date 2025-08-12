// src/app/[client]/page.tsx
'use client';

import { useRouter, useParams } from 'next/navigation';
import { isValidClient } from '@/config/clientConfig';
import { useEffect } from 'react';

export default function ClientRootRedirect() {
  const params = useParams();
  const router = useRouter();
  const clientName = params.client as string;

  useEffect(() => {
    if (!clientName || !isValidClient(clientName)) return;
    router.replace(`/${clientName}/manage`);
  }, [clientName, router]);

  return null;
}


