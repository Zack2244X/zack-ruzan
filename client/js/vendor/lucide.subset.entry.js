import {
  createElement,
  ArrowLeft,
  ArrowRight,
  Award,
  CalendarDays,
  ChartLine,
  Check,
  ChevronDown,
  Circle,
  CircleAlert,
  CircleCheck,
  Clock3,
  Coins,
  Crown,
  Download,
  FileText,
  FileUp,
  Flame,
  FolderOpen,
  GraduationCap,
  House,
  Link,
  LoaderCircle,
  Lock,
  LogIn,
  LogOut,
  Moon,
  Pencil,
  Plus,
  PlusCircle,
  Presentation,
  RefreshCw,
  RotateCw,
  Save,
  Settings,
  ShieldCheck,
  SquarePen,
  Sun,
  Trash2,
  TriangleAlert,
  Trophy,
  UserCog,
  Users,
  X,
  Zap,
} from "lucide";

const subsetIcons = {
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  award: Award,
  "calendar-days": CalendarDays,
  "chart-line": ChartLine,
  check: Check,
  "chevron-down": ChevronDown,
  circle: Circle,
  "circle-alert": CircleAlert,
  "circle-check": CircleCheck,
  "clock-3": Clock3,
  coins: Coins,
  crown: Crown,
  download: Download,
  "file-text": FileText,
  "file-up": FileUp,
  flame: Flame,
  "folder-open": FolderOpen,
  "graduation-cap": GraduationCap,
  house: House,
  link: Link,
  "loader-circle": LoaderCircle,
  lock: Lock,
  "log-in": LogIn,
  "log-out": LogOut,
  moon: Moon,
  pencil: Pencil,
  plus: Plus,
  "plus-circle": PlusCircle,
  presentation: Presentation,
  "refresh-cw": RefreshCw,
  "rotate-cw": RotateCw,
  save: Save,
  settings: Settings,
  "shield-check": ShieldCheck,
  "square-pen": SquarePen,
  sun: Sun,
  "trash-2": Trash2,
  "triangle-alert": TriangleAlert,
  trophy: Trophy,
  "user-cog": UserCog,
  users: Users,
  x: X,
  zap: Zap,
};

function toPascalCase(iconName) {
  return String(iconName)
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

const mergedIcons = {};
Object.entries(subsetIcons).forEach(([name, iconDef]) => {
  mergedIcons[name] = iconDef;
  mergedIcons[toPascalCase(name)] = iconDef;
});

window.lucide = window.lucide || {};
window.lucide.createElement = createElement;
window.lucide.icons = {
  ...(window.lucide.icons || {}),
  ...mergedIcons,
};
