export type NameCount = { name: string; count: number };

export type Prefecture = {
  name: string;
  registered: number;
  contracts: number;
  liquidity: number;
  medianSalePrice: number | null;
  medianAge: number | null;
};

export type Aggregates = {
  meta: {
    source: string;
    sourceUrl: string;
    asOf: string;
    generatedAt: string;
    totalRegistered: number;
    totalContracts: number;
    medianSalePriceAll: number | null;
    medianAgeAll: number | null;
    ultraCheapCount: number;
    freeCount: number;
  };
  categoriesRegistered: NameCount[];
  categoriesContracts: NameCount[];
  structures: NameCount[];
  priceBands: NameCount[];
  ageBands: NameCount[];
  prefectures: Prefecture[];
};
