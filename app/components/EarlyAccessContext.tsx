"use client";

import { createContext, useContext, useState, ReactNode } from "react";

type EarlyAccessContextType = {
  isOpen: boolean;
  source: string;
  open: (source?: string) => void;
  close: () => void;
};

const EarlyAccessContext = createContext<EarlyAccessContextType>({
  isOpen: false,
  source: "OTHER",
  open: () => {},
  close: () => {},
});

export function useEarlyAccess() {
  return useContext(EarlyAccessContext);
}

export default function EarlyAccessProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [source, setSource] = useState("OTHER");

  const open = (src = "OTHER") => {
    setSource(src);
    setIsOpen(true);
  };

  const close = () => setIsOpen(false);

  return (
    <EarlyAccessContext.Provider value={{ isOpen, source, open, close }}>
      {children}
    </EarlyAccessContext.Provider>
  );
}
