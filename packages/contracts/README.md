# API and event contracts

The TypeScript files are the compile-time public contract. Keep wire schemas versioned and backward-compatible. Do not treat branded TypeScript strings as runtime validation; validate all inbound values at the API boundary.