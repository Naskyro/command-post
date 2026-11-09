export type ReportMode='period'|'all-time'|'snapshot'|'recency';
export type ReportDefinition={id:string;title:string;description:string;category:string;mode:ReportMode;keyword?:boolean};
export type PortfolioColumn={key:string;label:string;format:'text'|'integer'|'money'|'decimal'|'percent'|'date'};
export type PortfolioReportRow={accountId?:string;values:Record<string,string|number|null>};
export type PortfolioReportResult={id:string;title:string;description:string;category:string;period:string;scope:string;generatedAt:string;columns:PortfolioColumn[];rows:PortfolioReportRow[];notes:string[];summary:{label:string;value:string}[]};
export type PortfolioCatalog={catalog:ReportDefinition[];scopes:{id:string;name:string}[];properties:{id:string;name:string}[];defaultScope:string;today:string;defaultFrom:string;defaultTo:string;latestPayment:string};
