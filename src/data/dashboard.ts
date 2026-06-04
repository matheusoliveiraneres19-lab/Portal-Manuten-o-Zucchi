import {
  AlertTriangle,
  Bell,
  ClipboardList,
  Droplet,
  FileText,
  Package,
  ShoppingCart
} from "lucide-react";

export const kpis = [
  {
    title: "OS Abertas",
    value: "24",
    trend: "14% vs mês anterior",
    direction: "up",
    tone: "blue",
    icon: ClipboardList
  },
  {
    title: "Compras Pendentes",
    value: "18",
    trend: "8% vs mês anterior",
    direction: "up",
    tone: "gold",
    icon: ShoppingCart
  },
  {
    title: "Máquinas Críticas",
    value: "7",
    trend: "40% vs mês anterior",
    direction: "up",
    tone: "red",
    icon: AlertTriangle
  },
  {
    title: "Consumo Lubrificantes",
    value: "1.245 L",
    trend: "6% vs mês anterior",
    direction: "down",
    tone: "blue",
    icon: Droplet
  },
  {
    title: "Materiais Mais Utilizados",
    value: "32",
    trend: "12% vs mês anterior",
    direction: "up",
    tone: "gold",
    icon: Package
  },
  {
    title: "Procedimentos Ativos",
    value: "56",
    trend: "0% vs mês anterior",
    direction: "flat",
    tone: "blue",
    icon: FileText
  }
] as const;

export const openClosedOrders = [
  { name: "01/05", abertas: 50, fechadas: 12 },
  { name: "08/05", abertas: 60, fechadas: 22 },
  { name: "15/05", abertas: 64, fechadas: 31 },
  { name: "22/05", abertas: 68, fechadas: 27 },
  { name: "31/05", abertas: 80, fechadas: 49 }
];

export const correctivePreventive = [
  { name: "Corretiva", value: 104, color: "#b51f32" },
  { name: "Preventiva", value: 52, color: "#2f6384" }
];

export const criticalEquipment = [
  { name: "Ponte Rolante Principal", value: 12 },
  { name: "Teares Breton Z400", value: 9 },
  { name: "Politriz Automática P36", value: 7 },
  { name: "Compressor Atlas Copco", value: 6 },
  { name: "Bomba d'água Industrial", value: 5 }
];

export const pendingPurchases = [
  { item: "Rolamento 6312 ZZ", supplier: "SKF", date: "25/05/2024", value: "R$ 1.250,00" },
  { item: "Óleo Hidráulico ISO 68", supplier: "Petrobrás", date: "27/05/2024", value: "R$ 2.340,00" },
  { item: "Correia Poly-V BX58", supplier: "Gates", date: "28/05/2024", value: "R$ 680,00" },
  { item: "Graxa Industrial 2 KG", supplier: "Klüber", date: "30/05/2024", value: "R$ 420,00" },
  { item: "Válvula Solenóide 24V", supplier: "Festo", date: "31/05/2024", value: "R$ 950,00" }
];

export const alerts = [
  { text: "Ponte Rolante Principal - Vibração acima do normal", time: "Agora", icon: Bell },
  { text: "Compressor Atlas Copco - Pressão instável", time: "10 min", icon: AlertTriangle },
  { text: "Politriz Automática P36 - Temperatura elevada", time: "25 min", icon: AlertTriangle }
];

export const collaboratorHours = [
  { name: "João Silva", value: 42 },
  { name: "Carlos Ferreira", value: 38 },
  { name: "Marcos Paulo", value: 35 },
  { name: "José Santos", value: 28 },
  { name: "Rafael Lima", value: 24 }
];

export const monthlyPurchases = [
  { name: "Jan", value: 28.5 },
  { name: "Fev", value: 35.2 },
  { name: "Mar", value: 32.1 },
  { name: "Abr", value: 41.8 },
  { name: "Mai", value: 37.6 }
];

export const lubricantConsumption = [
  { name: "01/05", value: 1000 },
  { name: "06/05", value: 1320 },
  { name: "10/05", value: 1420 },
  { name: "15/05", value: 1210 },
  { name: "20/05", value: 1390 },
  { name: "24/05", value: 1510 },
  { name: "28/05", value: 1630 },
  { name: "31/05", value: 1610 }
];

export const topBreakdownMachines = [
  { name: "Teares Breton Z400", value: 8.2 },
  { name: "Politriz Automática P36", value: 6.7 },
  { name: "Ponte Rolante Principal", value: 5.9 },
  { name: "Cortadeira GMM 3000", value: 4.3 },
  { name: "Compressor Atlas Copco", value: 3.8 }
];

