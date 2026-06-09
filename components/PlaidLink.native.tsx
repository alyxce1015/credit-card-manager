import React from 'react';
import {
  PlaidLink as NativePlaidLink,
  LinkSuccess,
  LinkExit,
} from 'react-native-plaid-link-sdk';

interface Props {
  linkToken: string;
  onSuccess: (publicToken: string, metadata: LinkSuccess['metadata']) => void;
  onExit?: (error: LinkExit['error'] | null) => void;
  children: React.ReactNode;
}

export default function PlaidLink({ linkToken, onSuccess, onExit, children }: Props) {
  return (
    <NativePlaidLink
      tokenConfig={{ token: linkToken }}
      onSuccess={(success: LinkSuccess) => onSuccess(success.publicToken, success.metadata)}
      onExit={(exit: LinkExit) => onExit?.(exit.error ?? null)}
    >
      {children}
    </NativePlaidLink>
  );
}
