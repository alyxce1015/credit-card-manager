import React, { useEffect, useRef } from 'react';
import { TouchableOpacity } from 'react-native';

declare global {
  interface Window {
    Plaid: {
      create: (config: {
        token: string;
        onSuccess: (public_token: string, metadata: object) => void;
        onExit: (err: object | null, metadata: object) => void;
      }) => { open: () => void; destroy: () => void };
    };
  }
}

interface Props {
  linkToken: string;
  onSuccess: (publicToken: string, metadata: object) => void;
  onExit?: (error: object | null) => void;
  children: React.ReactNode;
}

export default function PlaidLink({ linkToken, onSuccess, onExit, children }: Props) {
  const handlerRef = useRef<{ open: () => void; destroy: () => void } | null>(null);

  useEffect(() => {
    const SCRIPT_ID = 'plaid-link-script';

    const init = () => {
      handlerRef.current = window.Plaid.create({
        token: linkToken,
        onSuccess: (public_token, metadata) => onSuccess(public_token, metadata),
        onExit: (err, _metadata) => onExit?.(err),
      });
    };

    if (window.Plaid) {
      init();
      return;
    }

    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
      document.head.appendChild(script);
    }
    script.addEventListener('load', init);

    return () => {
      handlerRef.current?.destroy();
    };
  }, [linkToken]);

  return (
    <TouchableOpacity onPress={() => handlerRef.current?.open()}>
      {children}
    </TouchableOpacity>
  );
}
