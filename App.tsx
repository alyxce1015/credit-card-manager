import { useState, useEffect, useRef } from 'react';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import {
  Text, View, ScrollView, Pressable, TouchableOpacity,
  Modal, TextInput, KeyboardAvoidingView, Image,
  useWindowDimensions, Animated, Linking, Alert,
} from 'react-native';
import { layoutStyles } from './styles/layout';
import { cardStyles } from './styles/card';
import { modalStyles } from './styles/modal';
import { dashStyles as ds } from './styles/dashboard';
import { FontAwesome6 } from '@expo/vector-icons';
import { CARD_CATALOG, ISSUERS, type CatalogCard, type Benefit } from './data/cards';
import { getCards, insertCard, deleteCard, deleteCards, updateCard, setCardPaidDate, getPurchases, insertPurchase, clearAllData, plaidGetLinkToken, plaidExchangeToken, plaidSyncLiabilities, plaidSyncTransactions, type UserCard, type Purchase } from './db/database';

// ─── Helpers ────────────────────────────────────────────────────────────────


function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function ordinal(n: number): string {
  const v = n % 100;
  const suffix = v >= 11 && v <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
}

function daysUntilDue(dueDay: number): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let due = new Date(today.getFullYear(), today.getMonth(), dueDay);
  due.setHours(0, 0, 0, 0);
  if (due < today) due = new Date(today.getFullYear(), today.getMonth() + 1, dueDay);
  return Math.ceil((due.getTime() - today.getTime()) / 86400000);
}

function formatCurrency(input: string): string {
  const digits = input.replace(/[^0-9]/g, '');
  if (!digits) return '';
  return '$' + parseInt(digits, 10).toLocaleString('en-US');
}

// Card Opened field (no-fee cards) — MM/YYYY input helpers
function formatMemberSince(input: string): string {
  const digits = input.replace(/[^0-9]/g, '').slice(0, 6);
  if (digits.length <= 2) return digits;
  return digits.slice(0, 2) + '/' + digits.slice(2);
}

function parseMemberSince(input: string): string | undefined {
  const match = input.trim().match(/^(\d{1,2})\/(\d{4})$/);
  if (!match) return undefined;
  const month = parseInt(match[1], 10);
  const year = parseInt(match[2], 10);
  if (month < 1 || month > 12) return undefined;
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  const minYear = currentYear - 60;
  if (year < minYear || year > currentYear) return undefined;
  if (year === currentYear && month > currentMonth) return undefined;
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

function formatCardOpened(memberSince: string): string {
  const d = new Date(memberSince + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function getCardAge(memberSince: string): string {
  const opened = new Date(memberSince + 'T00:00:00');
  const today = new Date();
  const totalMonths = (today.getFullYear() - opened.getFullYear()) * 12 + (today.getMonth() - opened.getMonth());
  if (totalMonths < 1) return '< 1 mo old';
  if (totalMonths < 12) return `${totalMonths} mo old`;
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  if (months === 0) return `${years} yr${years > 1 ? 's' : ''} old`;
  return `${years} yr${years > 1 ? 's' : ''} ${months} mo old`;
}

// Fee Due Date field (annual-fee cards) — MM/DD/YYYY input helpers
function formatFeeDueDateInput(input: string): string {
  const digits = input.replace(/[^0-9]/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return digits.slice(0, 2) + '/' + digits.slice(2);
}

function parseFeeDueDate(input: string): string | undefined {
  const match = input.trim().match(/^(\d{2})\/(\d{2})$/);
  if (!match) return undefined;
  const month = parseInt(match[1], 10);
  const day = parseInt(match[2], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  // Validate the day exists in that month (use a leap year so Feb 29 is valid)
  const d = new Date(2000, month - 1, day);
  if (d.getMonth() !== month - 1 || d.getDate() !== day) return undefined;
  return `2000-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Annual fee renewal tracking — based on exact fee due date
function nextRenewalDate(feeDueDate: string): Date {
  const due = new Date(feeDueDate + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let renewal = new Date(due);
  renewal.setFullYear(today.getFullYear());
  renewal.setHours(0, 0, 0, 0);
  if (renewal < today) {
    renewal.setFullYear(today.getFullYear() + 1);
    renewal.setHours(0, 0, 0, 0);
  }
  return renewal;
}

function daysUntilRenewal(feeDueDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((nextRenewalDate(feeDueDate).getTime() - today.getTime()) / 86400000);
}

function renewalProgress(feeDueDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const renewal = nextRenewalDate(feeDueDate);
  const prev = new Date(renewal);
  prev.setFullYear(prev.getFullYear() - 1);
  const total = renewal.getTime() - prev.getTime();
  const elapsed = today.getTime() - prev.getTime();
  return Math.max(0, Math.min(1, elapsed / total));
}

function formatRenewalDate(feeDueDate: string): string {
  return nextRenewalDate(feeDueDate).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function formatPurchaseAmount(input: string): string {
  const stripped = input.replace(/[^0-9.]/g, '');
  const parts = stripped.split('.');
  const whole = parts[0] || '';
  const decimal = parts.length > 1 ? '.' + parts[1].slice(0, 2) : '';
  if (!whole && !decimal) return '';
  return '$' + whole + decimal;
}

function parsePurchaseAmount(input: string): number {
  const n = parseFloat(input.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 0 : n;
}

function formatDateInput(input: string): string {
  const digits = input.replace(/[^0-9]/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return digits.slice(0, 2) + '/' + digits.slice(2);
  return digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4);
}

function parseDateInput(input: string): string | undefined {
  const match = input.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return undefined;
  const month = parseInt(match[1], 10);
  const day = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const d = new Date(year, month - 1, day);
  if (d.getMonth() !== month - 1 || d.getDate() !== day) return undefined;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function currentDueDate(dueDay: number): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let due = new Date(today.getFullYear(), today.getMonth(), dueDay);
  due.setHours(0, 0, 0, 0);
  if (due < today) due = new Date(today.getFullYear(), today.getMonth() + 1, dueDay);
  return due.toISOString().split('T')[0];
}

function isCardPaid(card: UserCard): boolean {
  if (card.minimumPayment !== undefined) return card.minimumPayment === 0;
  if (!card.paidDate) return false;
  const dueDate = card.nextPaymentDue ?? (card.dueDay ? currentDueDate(card.dueDay) : null);
  return !!dueDate && card.paidDate === dueDate;
}

function formatSyncedTime(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function abbreviateCardName(name: string): string {
  return name
    .replace(/Bank of America/gi, 'BofA')
    .replace(/American Express/gi, 'AMEX')
    .replace(/Wells Fargo/gi, 'WF')
    .replace(/Capital One/gi, 'Cap1');
}

function memberSinceToDisplay(stored: string): string {
  const parts = stored.split('-');
  if (parts.length < 2) return '';
  return `${parts[1]}/${parts[0]}`; // MM/YYYY
}

function feeDueDateToDisplay(stored: string): string {
  // stored: "2000-MM-DD"
  const parts = stored.split('-');
  if (parts.length < 3) return '';
  return `${parts[1]}/${parts[2]}`; // MM/DD
}

function formatPurchaseDate(date: string): string {
  const d = new Date(date + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  d.setHours(0, 0, 0, 0);
  if (d.getTime() === today.getTime()) return 'Today';
  if (d.getTime() === yesterday.getTime()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function todayMMDDYYYY(): string {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

const CATEGORY_META: Record<Purchase['category'], { icon: string; label: string }> = {
  food:    { icon: 'utensils',        label: 'Food & Dining' },
  grocery: { icon: 'basket-shopping', label: 'Grocery'       },
  gas:     { icon: 'gas-pump',        label: 'Gas'           },
  travel:  { icon: 'plane',           label: 'Travel'        },
  online:  { icon: 'cart-shopping',   label: 'Online'        },
  store:   { icon: 'bag-shopping',    label: 'In-Store'      },
};

const BENEFIT_LEGEND: { icon: string; label: string; description: string }[] = [
  { icon: 'plane',           label: 'Travel / Flights',          description: 'Airline tickets, Chase/Amex travel portals' },
  { icon: 'hotel',           label: 'Hotels',                    description: 'Hotel stays booked directly or via portal' },
  { icon: 'utensils',        label: 'Dining',                    description: 'Restaurants, cafes, bars, and food delivery' },
  { icon: 'basket-shopping', label: 'Groceries',                 description: 'Supermarkets and grocery stores' },
  { icon: 'gas-pump',        label: 'Gas Stations',              description: 'Fuel purchases at gas stations' },
  { icon: 'cart-shopping',   label: 'Online Shopping',           description: 'Purchases made online (e.g. Amazon)' },
  { icon: 'store',           label: 'Drugstores',                description: 'Pharmacies like CVS and Walgreens' },
  { icon: 'house',           label: 'Rent',                      description: 'Eligible rent payments' },
  { icon: 'arrows-rotate',   label: 'Rotating / Choice Cat.',    description: 'Categories that change quarterly or you choose' },
  { icon: 'money-bill',      label: 'All Purchases',             description: 'Base rate on everything else' },
];

const BENEFIT_CATEGORY_MAP: Record<string, { display: string; icon: string }> = {
  'Travel':       { display: 'Travel',           icon: 'plane'           },
  'Hotels':       { display: 'Hotels',           icon: 'hotel'           },
  'Dining':       { display: 'Dining',           icon: 'utensils'        },
  'Groceries':    { display: 'Groceries',        icon: 'basket-shopping' },
  'Gas':          { display: 'Gas',              icon: 'gas-pump'        },
  'Drugstore':    { display: 'Drugstore',        icon: 'store'           },
  'Online':       { display: 'Online Shopping',  icon: 'cart-shopping'   },
  'Streaming':    { display: 'Streaming',        icon: 'tv'              },
  'Car Rental':   { display: 'Car Rental',       icon: 'car'             },
  'Rent':         { display: 'Rent',             icon: 'house'           },
  'Transit':      { display: 'Transit',          icon: 'train'           },
  'All Purchases':{ display: 'All Purchases',    icon: 'money-bill'      },
};

const CATEGORY_DISPLAY_ORDER = ['Travel','Hotels','Dining','Groceries','Gas','Drugstore','Online','Streaming','Car Rental','Rent','Transit'];

function normalizeCategory(cat: string): string {
  const lower = cat.toLowerCase();
  if (lower.includes('travel') || lower.includes('flight')) return 'Travel';
  if (lower.includes('hotel')) return 'Hotels';
  if (lower.includes('dining')) return 'Dining';
  if (lower.includes('grocer')) return 'Groceries';
  if (lower.includes('gas')) return 'Gas';
  if (lower.includes('drugstore')) return 'Drugstore';
  if (lower.includes('online')) return 'Online';
  if (lower.includes('streaming')) return 'Streaming';
  if (lower.includes('car rental') || lower.includes('rental')) return 'Car Rental';
  if (lower.includes('rent')) return 'Rent';
  if (lower.includes('transit')) return 'Transit';
  if (lower.includes('all purchases')) return 'All Purchases';
  return cat;
}

function parseMultiplier(m: string): number {
  const n = parseFloat(m.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 0 : n;
}

function isRotatingBenefit(cat: string): boolean {
  const lower = cat.toLowerCase();
  return lower.includes('rotating') || lower.includes('choice') || lower.includes('top category');
}

function buildTiers<T extends { benefit: Benefit }>(items: T[]): { multiplier: string; value: number; items: T[] }[] {
  const tiers: { multiplier: string; value: number; items: T[] }[] = [];
  for (const item of items) {
    const val = parseMultiplier(item.benefit.multiplier);
    const last = tiers[tiers.length - 1];
    if (last && last.value === val) { last.items.push(item); }
    else if (tiers.length < 2) { tiers.push({ multiplier: item.benefit.multiplier, value: val, items: [item] }); }
  }
  return tiers;
}


const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_LABELS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function CalendarPicker({ value, onSelect, onClose }: {
  value: string;       // MM/DD/YYYY or ''
  onSelect: (v: string) => void;
  onClose: () => void;
}) {
  const parseDisplay = (v: string) => {
    const m = v.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) { const d = new Date(+m[3], +m[1] - 1, +m[2]); if (!isNaN(d.getTime())) return d; }
    return null;
  };
  const initial = parseDisplay(value) ?? new Date();
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());
  const selected = parseDisplay(value);
  const todayMs = (() => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); })();

  function prevMonth() { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); }
  function nextMonth() { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); }

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' }} onPress={onClose}>
        <Pressable onPress={() => {}} style={{ backgroundColor: '#F4EDE4', borderRadius: 20, padding: 20, width: 320, borderWidth: 1, borderColor: '#CBB9A8', shadowColor: '#2B1D17', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 20, elevation: 10 }}>
          {/* Month nav */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <Pressable onPress={prevMonth} hitSlop={12} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
              <FontAwesome6 name="chevron-left" size={14} color="#6F4E37" iconStyle="solid" />
            </Pressable>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#2A211C' }}>{MONTH_NAMES[viewMonth]} {viewYear}</Text>
            <Pressable onPress={nextMonth} hitSlop={12} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
              <FontAwesome6 name="chevron-right" size={14} color="#6F4E37" iconStyle="solid" />
            </Pressable>
          </View>
          {/* Day-of-week labels */}
          <View style={{ flexDirection: 'row', marginBottom: 6 }}>
            {DAY_LABELS.map(l => (
              <Text key={l} style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: '#8C6E5A' }}>{l}</Text>
            ))}
          </View>
          {/* Day grid */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {cells.map((day, i) => {
              if (!day) return <View key={`e${i}`} style={{ width: '14.28%', aspectRatio: 1 }} />;
              const ms = new Date(viewYear, viewMonth, day).setHours(0,0,0,0);
              const isToday = ms === todayMs;
              const isSel = selected ? new Date(selected).setHours(0,0,0,0) === ms : false;
              return (
                <Pressable
                  key={day}
                  onPress={() => {
                    const mm = String(viewMonth + 1).padStart(2, '0');
                    const dd = String(day).padStart(2, '0');
                    onSelect(`${mm}/${dd}/${viewYear}`);
                    onClose();
                  }}
                  style={({ pressed }) => ({
                    width: '14.28%', aspectRatio: 1,
                    justifyContent: 'center', alignItems: 'center', borderRadius: 100,
                    backgroundColor: isSel ? '#C08A5B' : isToday ? 'rgba(192,138,91,0.18)' : pressed ? 'rgba(192,138,91,0.12)' : 'transparent',
                  })}
                >
                  <Text style={{ fontSize: 13, fontWeight: isSel || isToday ? '700' : '400', color: isSel ? '#fff' : isToday ? '#C08A5B' : '#2A211C' }}>
                    {day}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts(FontAwesome6.font);
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const isDesktop = windowWidth >= 768;
  const [cards, setCards] = useState<UserCard[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [step, setStep] = useState<'pick' | 'details'>('pick');
  const [selectedCard, setSelectedCard] = useState<CatalogCard | null>(null);
  const [search, setSearch] = useState('');
  const [issuerFilter, setIssuerFilter] = useState('All');
  const [form, setForm] = useState({ customName: '', lastFour: '', dueDay: '', limit: '', memberSince: '', feeDueDate: '' });
  const [saveError, setSaveError] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteError, setDeleteError] = useState('');
  const [activeTab, setActiveTab] = useState<'home' | 'cards' | 'benefits' | 'more'>('home');
  const [, setTick] = useState(0);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingCard, setEditingCard] = useState<UserCard | null>(null);
  const [editForm, setEditForm] = useState({ customName: '', lastFour: '', dueDay: '', limit: '', memberSince: '', feeDueDate: '' });
  const [editError, setEditError] = useState('');
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [purchaseModalVisible, setPurchaseModalVisible] = useState(false);
  const [purchaseForm, setPurchaseForm] = useState({
    cardId: '',
    amount: '',
    merchant: '',
    category: '' as Purchase['category'] | '',
    date: '',
  });
  const [purchaseError, setPurchaseError] = useState('');
  const [legendVisible, setLegendVisible] = useState(false);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [benefitCategoryFilter, setBenefitCategoryFilter] = useState('All');
  const [benefitFilterOpen, setBenefitFilterOpen] = useState(false);
  const [connectingCardId, setConnectingCardId] = useState<string | null>(null);
  const [syncingCardId, setSyncingCardId] = useState<string | null>(null);
  const [connectingBank, setConnectingBank] = useState(false);

  const APP_PIN = process.env.EXPO_PUBLIC_APP_PIN ?? '';
  const [unlocked, setUnlocked] = useState<boolean>(() => {
    if (!APP_PIN) return true;
    try { return typeof window !== 'undefined' && window.localStorage?.getItem('espressowe_pin_ok') === '1'; } catch { return false; }
  });
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const pinShakeAnim = useRef(new Animated.Value(0)).current;
  const unlockedRef = useRef(unlocked);

  const stepAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    async function init() {
      const loadedCards = await getCards();
      setCards(loadedCards);
      setPurchases(await getPurchases());
      const connected = loadedCards.filter(c => c.plaidItemId);
      if (connected.length === 0) return;
      await Promise.all(connected.map(c =>
        Promise.all([plaidSyncLiabilities(c.id), plaidSyncTransactions(c.id)]).catch(() => {})
      ));
      const [newCards, newPurchases] = await Promise.all([getCards(), getPurchases()]);
      setCards(newCards);
      setPurchases(newPurchases);
    }
    init().catch((e) => setSaveError('Could not load cards: ' + (e instanceof Error ? e.message : String(e))));
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    async function onVisible() {
      if (document.visibilityState !== 'visible') return;
      const currentCards = await getCards().catch(() => [] as UserCard[]);
      const connected = currentCards.filter(c => c.plaidItemId);
      if (connected.length === 0) return;
      await Promise.all(connected.map(c =>
        Promise.all([plaidSyncLiabilities(c.id), plaidSyncTransactions(c.id)]).catch(() => {})
      ));
      const [newCards, newPurchases] = await Promise.all([getCards(), getPurchases()]);
      setCards(newCards);
      setPurchases(newPurchases);
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick(n => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Keep ref in sync so the inactivity interval always sees current unlock state
  useEffect(() => { unlockedRef.current = unlocked; }, [unlocked]);

  // Track any user interaction to reset the inactivity clock
  useEffect(() => {
    if (!APP_PIN || typeof document === 'undefined') return;
    const reset = () => {
      try { window.localStorage.setItem('espressowe_last_activity', String(Date.now())); } catch {}
    };
    document.addEventListener('touchstart', reset, { passive: true });
    document.addEventListener('mousedown', reset);
    document.addEventListener('keydown', reset);
    return () => {
      document.removeEventListener('touchstart', reset);
      document.removeEventListener('mousedown', reset);
      document.removeEventListener('keydown', reset);
    };
  }, [APP_PIN]);

  // On mount: lock if already timed out. Interval: lock after 15 min of inactivity.
  useEffect(() => {
    if (!APP_PIN) return;
    const INACTIVITY_MS = 15 * 60 * 1000;
    const checkInactivity = () => {
      if (!unlockedRef.current) return;
      try {
        const last = parseInt(window.localStorage.getItem('espressowe_last_activity') ?? '0', 10);
        if (last > 0 && Date.now() - last > INACTIVITY_MS) {
          window.localStorage.removeItem('espressowe_pin_ok');
          setUnlocked(false);
        }
      } catch {}
    };
    checkInactivity();
    const id = setInterval(checkInactivity, 30_000);
    return () => clearInterval(id);
  }, [APP_PIN]);

  if (!fontsLoaded) return null;

  // ── PIN gate ────────────────────────────────────────────────────────────────
  function handlePinDigit(d: string) {
    if (pinError) return;
    const next = pinInput + d;
    if (next.length < 4) { setPinInput(next); return; }
    if (next === APP_PIN) {
      try {
        window.localStorage.setItem('espressowe_pin_ok', '1');
        window.localStorage.setItem('espressowe_last_activity', String(Date.now()));
      } catch {}
      setPinInput('');
      setUnlocked(true);
    } else {
      setPinInput('');
      setPinError(true);
      Animated.sequence([
        Animated.timing(pinShakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
        Animated.timing(pinShakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
        Animated.timing(pinShakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
        Animated.timing(pinShakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
        Animated.timing(pinShakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
      ]).start(() => setPinError(false));
    }
  }

  if (!unlocked) {
    const pad = [['1','2','3'],['4','5','6'],['7','8','9'],['','0','⌫']];
    return (
      <View style={{ flex: 1, backgroundColor: '#2A211C', alignItems: 'center', justifyContent: 'center' }}>
        <StatusBar style="light" />
        <Text style={{ fontSize: 28, fontWeight: '800', color: '#F8F4EF', letterSpacing: 1, marginBottom: 6 }}>Espressowe</Text>
        <Text style={{ fontSize: 13, color: '#CBB9A8', marginBottom: 48 }}>Enter your PIN to continue</Text>
        <Animated.View style={{ flexDirection: 'row', gap: 16, marginBottom: 48, transform: [{ translateX: pinShakeAnim }] }}>
          {[0,1,2,3].map(i => (
            <View key={i} style={{
              width: 14, height: 14, borderRadius: 7,
              backgroundColor: pinError ? '#ff3b30' : i < pinInput.length ? '#C08A5B' : 'rgba(192,138,91,0.25)',
            }} />
          ))}
        </Animated.View>
        <View style={{ gap: 14 }}>
          {pad.map((row, ri) => (
            <View key={ri} style={{ flexDirection: 'row', gap: 14 }}>
              {row.map((key, ki) => (
                <Pressable
                  key={ki}
                  onPress={() => key === '⌫' ? setPinInput(p => p.slice(0,-1)) : key ? handlePinDigit(key) : null}
                  style={({ pressed }) => ({
                    width: 80, height: 80, borderRadius: 40,
                    backgroundColor: key ? pressed ? 'rgba(192,138,91,0.25)' : 'rgba(255,255,255,0.07)' : 'transparent',
                    alignItems: 'center', justifyContent: 'center',
                  })}
                >
                  <Text style={{ fontSize: key === '⌫' ? 20 : 26, fontWeight: '500', color: '#F8F4EF' }}>{key}</Text>
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      </View>
    );
  }

  function enterSelectMode() {
    setSelectMode(true);
    setSelectedIds(new Set());
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleDeleteOne(id: string) {
    setDeleteError('');
    setCards(prev => prev.filter(c => c.id !== id));
    try {
      await deleteCard(id);
    } catch (e) {
      setCards(await getCards());
      setDeleteError(e instanceof Error ? e.message : 'Could not remove card');
    }
  }

  async function handleDeleteSelected() {
    if (selectedIds.size === 0) return;
    setDeleteError('');
    const ids = [...selectedIds];
    exitSelectMode();
    setCards(prev => prev.filter(c => !ids.includes(c.id)));
    try {
      await deleteCards(ids);
    } catch (e) {
      setCards(await getCards());
      setDeleteError(e instanceof Error ? e.message : 'Could not remove cards');
    }
  }

  function openModal() {
    setStep('pick');
    setSelectedCard(null);
    setSearch('');
    setIssuerFilter('All');
    setForm({ customName: '', lastFour: '', dueDay: '', limit: '', memberSince: '', feeDueDate: '' });
    setSaveError('');
    stepAnim.setValue(1);
    setModalVisible(true);
  }

  function animateStep(callback: () => void) {
    Animated.timing(stepAnim, { toValue: 0, duration: 140, useNativeDriver: true }).start(() => {
      callback();
      Animated.timing(stepAnim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    });
  }

  function pickCard(card: CatalogCard) {
    animateStep(() => { setSelectedCard(card); setStep('details'); });
  }

  function goBack() {
    animateStep(() => setStep('pick'));
  }

  async function saveCard() {
    setSaveError('');
    if (!selectedCard) { setSaveError('No card selected.'); return; }

    const name = selectedCard.id === 'custom' ? form.customName.trim() : selectedCard.name;
    if (!name) { setSaveError('Card name is required.'); return; }

    const hasFee = selectedCard.annualFee > 0;

    // All cards: validate Card Opened (MM/YYYY)
    const memberSince = form.memberSince.trim() ? parseMemberSince(form.memberSince) : undefined;
    if (form.memberSince.trim() && !memberSince) {
      const today = new Date();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const yyyy = today.getFullYear();
      setSaveError(`Date must be MM/YYYY, between ${mm}/${yyyy - 60} and ${mm}/${yyyy}.`);
      return;
    }

    // Fee cards: validate Fee Due Date (MM/DD/YYYY)
    const feeDueDate = hasFee && form.feeDueDate.trim() ? parseFeeDueDate(form.feeDueDate) : undefined;
    if (hasFee && form.feeDueDate.trim() && !feeDueDate) {
      setSaveError('Enter a valid fee due date (MM/DD/YYYY).');
      return;
    }

    try {
      await insertCard({
        id: generateUUID(),
        catalogId: selectedCard.id,
        name,
        lastFour: form.lastFour.trim(),
        dueDay: 1,
        limit: '',
        imageUrl: '',
        color: selectedCard.color,
        memberSince,
        feeDueDate,
      });
      setCards(await getCards());
      setModalVisible(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  }

  const filteredCatalog = CARD_CATALOG.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase());
    const matchesIssuer = issuerFilter === 'All' || c.issuer === issuerFilter;
    return matchesSearch && matchesIssuer;
  });

  // Dashboard computations
  const spentByCard = purchases.reduce<Record<string, number>>((acc, p) => {
    acc[p.cardId] = (acc[p.cardId] ?? 0) + p.amount;
    return acc;
  }, {});
  const totalSpent = cards.reduce((sum, c) => {
    if (c.currentBalance !== undefined) return sum + c.currentBalance;
    return sum + (spentByCard[c.id] ?? 0);
  }, 0);

  const totalLimitValue = cards.reduce((sum, c) => {
    const manualLimit = parseInt((c.limit ?? '').replace(/[^0-9]/g, ''), 10);
    if (!isNaN(manualLimit) && manualLimit > 0) return sum + manualLimit;
    if (c.availableCredit !== undefined || c.currentBalance !== undefined) {
      return sum + (c.availableCredit ?? 0) + (c.currentBalance ?? 0);
    }
    return sum;
  }, 0);
  const totalAvailable = cards.reduce((sum, c) => {
    if (c.availableCredit !== undefined) return sum + c.availableCredit;
    const n = parseInt((c.limit ?? '').replace(/[^0-9]/g, ''), 10);
    return sum + (isNaN(n) ? 0 : Math.max(0, n - (spentByCard[c.id] ?? 0)));
  }, 0);

  const totalAnnualFees = cards.reduce((sum, c) => {
    const cat = CARD_CATALOG.find(x => x.id === c.catalogId);
    return sum + (cat?.annualFee ?? 0);
  }, 0);

  const _today = new Date(); _today.setHours(0, 0, 0, 0);
  const sortedByDue = [...cards]
    .map(c => ({
      ...c,
      days: c.nextPaymentDue
        ? Math.ceil((new Date(c.nextPaymentDue + 'T00:00:00').getTime() - _today.getTime()) / 86400000)
        : daysUntilDue(c.dueDay),
    }))
    .filter(c => c.days >= 0 && c.days <= 15)
    .sort((a, b) => a.days - b.days);

  const feesUpcoming = cards
    .filter((c): c is UserCard & { feeDueDate: string } => c.feeDueDate != null)
    .map(c => ({ ...c, days: daysUntilRenewal(c.feeDueDate) }))
    .filter(c => c.days <= 15)
    .sort((a, b) => a.days - b.days);

  const unpaidDue = sortedByDue.filter(c => !isCardPaid(c));
  const paymentInsight = unpaidDue.length > 0
    ? `${unpaidDue[0].name} · ${unpaidDue[0].days === 0 ? 'Statement due today' : unpaidDue[0].days === 1 ? 'Statement due tomorrow' : `Statement due in ${unpaidDue[0].days} days`}`
    : null;

  const feeInsight = feesUpcoming.length > 0
    ? `${feesUpcoming[0].name} · annual fee in ${feesUpcoming[0].days} days`
    : null;

  const walletBenefitItems = cards.flatMap(card => {
    const catalog = CARD_CATALOG.find(c => c.id === card.catalogId);
    if (!catalog) return [];
    return catalog.benefits.map(b => ({ card, catalog, benefit: b }));
  });
  const rotatingBenefitItems = walletBenefitItems.filter(item => isRotatingBenefit(item.benefit.category));
  const explicitBenefitItems = walletBenefitItems.filter(item =>
    !isRotatingBenefit(item.benefit.category) && item.benefit.category !== 'All Purchases'
  );
  const allPurchasesBenefitItems = walletBenefitItems.filter(item =>
    item.benefit.category === 'All Purchases'
  );
  const walletExplicitCategories = CATEGORY_DISPLAY_ORDER.filter(cat =>
    explicitBenefitItems.some(item => normalizeCategory(item.benefit.category) === cat)
  );
  const numBenefitCols = isDesktop ? 3 : 2;
  const catCardWidth = (windowWidth - 32 - (numBenefitCols - 1) * 14) / numBenefitCols;
  const benefitImgWidth = Math.min(Math.round(catCardWidth - 28), 200);
  const benefitImgHeight = Math.round(benefitImgWidth * 0.631);
  const allPurchasesTiers = buildTiers(
    [...allPurchasesBenefitItems].sort((a, b) => parseMultiplier(b.benefit.multiplier) - parseMultiplier(a.benefit.multiplier))
  );
  const filteredCatItems = benefitCategoryFilter !== 'All'
    ? explicitBenefitItems
        .filter(item => normalizeCategory(item.benefit.category) === benefitCategoryFilter)
        .sort((a, b) => parseMultiplier(b.benefit.multiplier) - parseMultiplier(a.benefit.multiplier))
    : [];
  const filteredCatMeta = BENEFIT_CATEGORY_MAP[benefitCategoryFilter];

  function handleTabPress(tab: typeof activeTab) {
    if (tab !== 'cards') exitSelectMode();
    setActiveTab(tab);
  }

  async function handleTogglePaid(card: UserCard) {
    const newPaidDate = isCardPaid(card) ? null : (card.nextPaymentDue ?? currentDueDate(card.dueDay));
    setCards(prev => prev.map(c => c.id === card.id ? { ...c, paidDate: newPaidDate ?? undefined } : c));
    try {
      await setCardPaidDate(card.id, newPaidDate);
    } catch {
      // keep optimistic state even if DB save fails
    }
  }

  async function handleConnectBank(card: UserCard) {
    setConnectingCardId(card.id);
    try {
      const token = await plaidGetLinkToken();

      const onSuccess = async (publicToken: string, metadata: any) => {
        try {
          const account = metadata?.accounts?.[0];
          await plaidExchangeToken({
            publicToken,
            accountId: account?.id ?? '',
            cardId: card.id,
            institutionName: metadata?.institution?.name ?? '',
            institutionId: metadata?.institution?.institution_id ?? '',
          });
          await Promise.all([
            plaidSyncLiabilities(card.id),
            plaidSyncTransactions(card.id),
          ]);
          const [newCards, newPurchases] = await Promise.all([getCards(), getPurchases()]);
          setCards(newCards);
          setPurchases(newPurchases);
        } catch (e) {
          Alert.alert('Connection failed', e instanceof Error ? e.message : 'Could not link account');
        } finally {
          setConnectingCardId(null);
        }
      };

      const onExit = (err: any) => {
        setConnectingCardId(null);
        if (err?.displayMessage) Alert.alert('Link error', err.displayMessage);
      };

      await new Promise<void>((resolve, reject) => {
        if ((window as any).Plaid) { resolve(); return; }
        const SCRIPT_ID = 'plaid-link-script';
        let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
        if (!script) {
          script = document.createElement('script');
          script.id = SCRIPT_ID;
          script.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
          document.head.appendChild(script);
        }
        script.addEventListener('load', () => resolve());
        script.addEventListener('error', () => reject(new Error('Failed to load Plaid')));
      });
      (window as any).Plaid.create({
        token,
        onSuccess: (public_token: string, metadata: any) => onSuccess(public_token, metadata),
        onExit: (err: any) => onExit(err?.error ?? err),
      }).open();
    } catch (e) {
      setConnectingCardId(null);
      console.error('[Plaid Connect]', e);
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not start bank connection');
    }
  }

  async function handleSyncCard(card: UserCard) {
    setSyncingCardId(card.id);
    try {
      await Promise.all([plaidSyncLiabilities(card.id), plaidSyncTransactions(card.id)]);
      const [newCards, newPurchases] = await Promise.all([getCards(), getPurchases()]);
      setCards(newCards);
      setPurchases(newPurchases);
    } catch (e) {
      Alert.alert('Sync failed', e instanceof Error ? e.message : 'Could not sync data');
    } finally {
      setSyncingCardId(null);
    }
  }

  async function handleConnectBankMore() {
    setConnectingBank(true);
    try {
      const token = await plaidGetLinkToken();

      await new Promise<void>((resolve, reject) => {
        if ((window as any).Plaid) { resolve(); return; }
        const SCRIPT_ID = 'plaid-link-script';
        let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
        if (!script) {
          script = document.createElement('script');
          script.id = SCRIPT_ID;
          script.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
          document.head.appendChild(script);
        }
        script.addEventListener('load', () => resolve());
        script.addEventListener('error', () => reject(new Error('Failed to load Plaid script')));
      });

      (window as any).Plaid.create({
        token,
        onSuccess: async (public_token: string, metadata: any) => {
          try {
            await plaidExchangeToken({
              publicToken: public_token,
              institutionName: metadata?.institution?.name ?? '',
              institutionId: metadata?.institution?.institution_id ?? '',
            });
            Alert.alert('Bank connected!', `${metadata?.institution?.name ?? 'Your bank'} has been linked successfully.`);
          } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Could not link account');
          } finally {
            setConnectingBank(false);
          }
        },
        onExit: () => { setConnectingBank(false); },
      }).open();
    } catch (e) {
      setConnectingBank(false);
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not start bank connection');
    }
  }

  async function handleClearAllData() {
    const message = 'This will permanently delete all your cards and purchases. This cannot be undone.';
    const confirmed = window.confirm(message);
    if (!confirmed) return;
    try {
      await clearAllData();
      setCards([]);
      setPurchases([]);
      setBenefitCategoryFilter('All');
      setBenefitFilterOpen(false);
      setSelectMode(false);
      setSelectedIds(new Set());
      setActiveTab('home');
    } catch {
      window.alert('Something went wrong. Please try again.');
    }
  }

  function openPurchaseModal() {
    setPurchaseForm({
      cardId: cards.length === 1 ? cards[0].id : '',
      amount: '',
      merchant: '',
      category: '',
      date: todayMMDDYYYY(),
    });
    setPurchaseError('');
    setPurchaseModalVisible(true);
  }

  async function savePurchase() {
    setPurchaseError('');
    if (!purchaseForm.cardId) { setPurchaseError('Select a card.'); return; }
    const amount = parsePurchaseAmount(purchaseForm.amount);
    if (!amount || amount <= 0) { setPurchaseError('Enter a valid amount.'); return; }
    if (!purchaseForm.merchant.trim()) { setPurchaseError('Enter a merchant name.'); return; }
    if (!purchaseForm.category) { setPurchaseError('Select a category.'); return; }
    const date = parseDateInput(purchaseForm.date);
    if (!date) { setPurchaseError('Enter a valid date (MM/DD/YYYY).'); return; }
    const purchase: Purchase = {
      id: generateUUID(),
      cardId: purchaseForm.cardId,
      amount,
      merchant: purchaseForm.merchant.trim(),
      category: purchaseForm.category as Purchase['category'],
      date,
    };
    try {
      await insertPurchase(purchase);
      setPurchases(await getPurchases());
      setPurchaseModalVisible(false);
    } catch (e) {
      setPurchaseError(e instanceof Error ? e.message : 'Could not save purchase.');
    }
  }

  function openEditModal(card: UserCard) {
    setEditingCard(card);
    setEditForm({
      customName: card.catalogId === 'custom' ? card.name : '',
      lastFour: card.lastFour,
      dueDay: String(card.dueDay),
      limit: card.limit,
      memberSince: card.memberSince ? memberSinceToDisplay(card.memberSince) : '',
      feeDueDate: card.feeDueDate ? feeDueDateToDisplay(card.feeDueDate) : '',
    });
    setEditError('');
    setEditModalVisible(true);
  }

  async function saveEdit() {
    setEditError('');
    if (!editingCard) return;
    const isCustom = editingCard.catalogId === 'custom';
    if (isCustom && !editForm.customName.trim()) { setEditError('Card name is required.'); return; }
    const memberSince = editForm.memberSince.trim() ? parseMemberSince(editForm.memberSince) : undefined;
    if (editForm.memberSince.trim() && !memberSince) { setEditError('Card Opened must be MM/YYYY.'); return; }
    const catalogEntry = CARD_CATALOG.find(c => c.id === editingCard.catalogId);
    const hasFee = (catalogEntry?.annualFee ?? 0) > 0;
    const feeDueDate = hasFee && editForm.feeDueDate.trim() ? parseFeeDueDate(editForm.feeDueDate) : undefined;
    if (hasFee && editForm.feeDueDate.trim() && !feeDueDate) { setEditError('Enter a valid fee due date (MM/DD).'); return; }
    try {
      await updateCard({
        ...editingCard,
        name: isCustom ? editForm.customName.trim() : editingCard.name,
        lastFour: editForm.lastFour.trim(),
        dueDay: editingCard.dueDay,
        limit: editingCard.limit,
        memberSince,
        feeDueDate,
      });
      setCards(await getCards());
      setEditModalVisible(false);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Could not save changes.');
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={activeTab === 'home' ? 'light' : 'dark'} />

      {/* ── HOME TAB ── */}
      {activeTab === 'home' && (
        <ScrollView style={ds.homeScroll} contentContainerStyle={ds.homeScrollContent} showsVerticalScrollIndicator={false}>

          {/* App title */}
          <View style={{ alignItems: 'center', gap: 8 }}>
            <Text style={ds.appTitle}>Espressowe</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, width: '55%' }}>
              <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(192,138,91,0.45)' }} />
              <FontAwesome6 name="mug-hot" size={10} color="#C08A5B" iconStyle="solid" />
              <FontAwesome6 name="mug-hot" size={10} color="#C08A5B" iconStyle="solid" />
              <FontAwesome6 name="mug-hot" size={10} color="#C08A5B" iconStyle="solid" />
              <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(192,138,91,0.45)' }} />
            </View>
          </View>

          {/* Hero card */}
          <View style={ds.heroCard}>
            <View style={ds.heroLeft}>
              <Text style={ds.heroHeading}>Available Credit</Text>
              <Text style={ds.heroAmount}>
                {totalLimitValue > 0 ? '$' + Math.max(0, totalAvailable).toLocaleString('en-US') : '—'}
              </Text>
              <Text style={ds.heroSub}>
                {cards.length > 0
                  ? totalSpent > 0
                    ? `$${totalSpent.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} spent · $${totalLimitValue.toLocaleString('en-US')} total limit`
                    : `Across ${cards.length} active card${cards.length !== 1 ? 's' : ''}`
                  : 'No cards added yet'}
              </Text>
              {(paymentInsight || feeInsight) ? (
                <View style={{ gap: 8, alignSelf: 'center', marginTop: 16 }}>
                  {paymentInsight && (
                    <View style={ds.insightPill}>
                      <FontAwesome6 name="credit-card" size={11} color="#C08A5B" iconStyle="solid" />
                      <Text style={ds.insightText}>{paymentInsight}</Text>
                    </View>
                  )}
                  {feeInsight && (
                    <View style={ds.insightPill}>
                      <FontAwesome6 name="receipt" size={11} color="#D4A373" iconStyle="solid" />
                      <Text style={ds.insightText}>{feeInsight}</Text>
                    </View>
                  )}
                </View>
              ) : cards.length > 0 ? (
                <View style={ds.insightPill}>
                  <FontAwesome6 name="check" size={11} color="#7A9E7E" iconStyle="solid" />
                  <Text style={ds.insightText}>All cards paid · nothing due soon</Text>
                </View>
              ) : (
                <View style={ds.insightPill}>
                  <FontAwesome6 name="sparkles" size={11} color="#7A9E7E" iconStyle="solid" />
                  <Text style={ds.insightText}>Add a card to see personalized insights</Text>
                </View>
              )}
            </View>
          </View>

          {/* Stats grid */}
          <View style={ds.statsGrid}>
            <View style={ds.statTile}>
              <View style={[ds.statIconWrap, { backgroundColor: 'rgba(192,138,91,0.15)' }]}>
                <FontAwesome6 name="credit-card" size={20} color="#C08A5B" iconStyle="solid" />
              </View>
              <Text style={ds.statValue}>{cards.length}</Text>
              <Text style={ds.statLabel}>Active cards</Text>
            </View>
            <View style={ds.statTile}>
              <View style={[ds.statIconWrap, { backgroundColor: 'rgba(122,158,126,0.15)' }]}>
                <FontAwesome6 name="receipt" size={20} color="#7A9E7E" iconStyle="solid" />
              </View>
              <Text style={ds.statValue}>${totalAnnualFees}</Text>
              <Text style={ds.statLabel}>Annual fees</Text>
            </View>
          </View>

          {/* Upcoming payments */}
          {sortedByDue.length > 0 && (
            <View style={ds.sectionCard}>
              <Text style={ds.sectionTitle}>Upcoming Payments</Text>
              {sortedByDue.map((item) => {
                const paid = isCardPaid(item);
                const urgent = !paid && item.days <= 10;
                const soon = !paid && !urgent && item.days <= 15;
                const label = paid ? 'Paid' : item.days === 0 ? 'Today' : item.days === 1 ? 'Tomorrow' : `${item.days}d`;
                return (
                  <View key={item.id} style={ds.listRow}>
                    <View style={[ds.listDot, { backgroundColor: item.color }]} />
                    <Text style={ds.listName} numberOfLines={1}>{item.name}</Text>
                    {paid && (
                      <FontAwesome6 name="check" size={13} color="#7A9E7E" iconStyle="solid" />
                    )}
                    {urgent && (
                      <FontAwesome6 name="triangle-exclamation" size={13} color="#ff3b30" iconStyle="solid" />
                    )}
                    {soon && (
                      <FontAwesome6 name="triangle-exclamation" size={13} color="#ff9500" iconStyle="solid" />
                    )}
                    <Text style={[ds.listBadge, paid && { color: '#7A9E7E', backgroundColor: 'rgba(122,158,126,0.15)' }, urgent && ds.listBadgeUrgent, soon && ds.listBadgeSoon]}>
                      {label}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* Annual fee renewals */}
          {feesUpcoming.length > 0 && (
            <View style={ds.sectionCard}>
              <Text style={ds.sectionTitle}>Annual Fee Renewals</Text>
              {feesUpcoming.map((item) => {
                const cat = CARD_CATALOG.find(c => c.id === item.catalogId);
                const urgent = item.days <= 10;
                const soon = !urgent && item.days <= 15;
                return (
                  <View key={item.id} style={ds.listRow}>
                    <View style={[ds.listDot, { backgroundColor: item.color }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={ds.listName} numberOfLines={1}>{item.name}</Text>
                      <Text style={ds.listSub}>${cat?.annualFee}/yr · {formatRenewalDate(item.feeDueDate)}</Text>
                    </View>
                    {urgent && (
                      <FontAwesome6 name="triangle-exclamation" size={13} color="#ff3b30" iconStyle="solid" />
                    )}
                    {soon && (
                      <FontAwesome6 name="triangle-exclamation" size={13} color="#ff9500" iconStyle="solid" />
                    )}
                    <Text style={[ds.listBadge, urgent && ds.listBadgeUrgent, soon && ds.listBadgeSoon]}>
                      {item.days}d
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* Recent Transactions */}
          {purchases.length > 0 && (
            <View style={ds.sectionCard}>
              <Text style={ds.sectionTitle}>Recent Transactions</Text>
              {[...purchases].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).map((p) => {
                const card = cards.find(c => c.id === p.cardId);
                const meta = CATEGORY_META[p.category];
                return (
                  <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{
                      width: 36, height: 36, borderRadius: 10,
                      backgroundColor: 'rgba(192,138,91,0.15)',
                      justifyContent: 'center', alignItems: 'center', flexShrink: 0,
                    }}>
                      <FontAwesome6 name={meta.icon} size={15} color="#C08A5B" iconStyle="solid" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={ds.listName} numberOfLines={1}>{p.merchant}</Text>
                      <Text style={ds.listSub}>
                        {meta.label}{card ? ` · ${isDesktop ? card.name : abbreviateCardName(card.name)}` : ''}{card?.lastFour ? ` ••${card.lastFour}` : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 2 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#2A211C' }}>
                        -${p.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                      <Text style={ds.listSub}>{formatPurchaseDate(p.date)}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Empty state */}
          {cards.length === 0 && (
            <View style={ds.homeEmpty}>
              <FontAwesome6 name="credit-card" size={44} color="#CBB9A8" iconStyle="solid" />
              <Text style={ds.homeEmptyTitle}>No cards yet</Text>
              <Text style={ds.homeEmptySub}>Head to the Cards tab to add your first card,{'\n'}or connect your bank from the More tab.</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* ── CARDS TAB ── */}
      {activeTab === 'cards' && (
        <View style={{ flex: 1, backgroundColor: '#5a473e', paddingTop: 60, paddingHorizontal: 20 }}>
          <View style={styles.headerRow}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
              <Text style={[ds.appTitle, { textAlign: 'left' }]}>My Cards</Text>
              <Pressable onPress={() => setLegendVisible(true)} hitSlop={8} style={{ marginBottom: 4 }}>
                <FontAwesome6 name="circle-info" size={15} color="#CBB9A8" iconStyle="solid" />
              </Pressable>
            </View>
            {cards.length > 0 && (
              <Pressable onPress={selectMode ? exitSelectMode : enterSelectMode} hitSlop={8}>
                <Text style={styles.selectButton}>{selectMode ? 'Cancel' : 'Select'}</Text>
              </Pressable>
            )}
          </View>

          {deleteError !== '' && (
            <Text style={styles.deleteErrorText}>{deleteError}</Text>
          )}

          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {cards.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateTitle}>No cards yet</Text>
                <Text style={styles.emptyStateSub}>Tap + Add Card to get started</Text>
              </View>
            )}

            <View style={[styles.cardGrid, isDesktop && styles.cardGridDesktop]}>
              {cards.map((card) => {
                const catalogEntry = CARD_CATALOG.find((c) => c.id === card.catalogId);
                const imageSource = catalogEntry?.image ?? null;
                const annualFee = catalogEntry?.annualFee ?? 0;
                const benefits = catalogEntry?.benefits ?? [];
                const isSelected = selectedIds.has(card.id);

                return (
                  <View key={card.id} style={isDesktop ? styles.cardGridItem : undefined}>
                    <View style={[styles.card, isSelected && styles.cardSelected, isDesktop && { flex: 1 }]}>
                      <View style={styles.cardImageColumn}>
                        <View style={[styles.cardImageWrap, { backgroundColor: card.color }]}>
                          {imageSource
                            ? <Image source={imageSource} style={styles.cardImage} resizeMode="cover" />
                            : <Text style={styles.customCardLabel}>{card.name}</Text>
                          }
                        </View>
                        {card.memberSince && (
                          <>
                            <Text style={styles.cardDateOpenedLabel}>{formatCardOpened(card.memberSince)}</Text>
                            <Text style={styles.cardAgeLabel}>{getCardAge(card.memberSince)}</Text>
                          </>
                        )}
                        {card.limit ? (
                          <Text style={styles.cardDateOpenedLabel}>
                            {'Limit: $' + parseFloat(card.limit).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </Text>
                        ) : null}
                        {card.minimumPayment !== undefined ? (
                          <View style={{
                            alignSelf: 'stretch' as const,
                            flexDirection: 'row' as const,
                            alignItems: 'center' as const,
                            justifyContent: 'center' as const,
                            gap: 4,
                            paddingVertical: 5,
                            borderRadius: 8,
                            marginTop: 2,
                            backgroundColor: card.minimumPayment === 0 ? 'rgba(122,158,126,0.15)' : 'rgba(192,138,91,0.1)',
                            borderWidth: 1,
                            borderColor: card.minimumPayment === 0 ? 'rgba(122,158,126,0.4)' : 'rgba(192,138,91,0.3)',
                          }}>
                            <FontAwesome6
                              name={card.minimumPayment === 0 ? 'check' : 'circle-exclamation'}
                              size={10}
                              color={card.minimumPayment === 0 ? '#7A9E7E' : '#C08A5B'}
                              iconStyle="solid"
                            />
                            <Text style={{ fontSize: 10, fontWeight: '600', color: card.minimumPayment === 0 ? '#7A9E7E' : '#C08A5B' }}>
                              {card.minimumPayment === 0 ? 'Paid' : `Min Due: $${card.minimumPayment.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                            </Text>
                          </View>
                        ) : (
                          <Pressable
                            onPress={() => handleTogglePaid(card)}
                            style={({ pressed }) => ({
                              alignSelf: 'stretch' as const,
                              flexDirection: 'row' as const,
                              alignItems: 'center' as const,
                              justifyContent: 'center' as const,
                              gap: 4,
                              paddingVertical: 5,
                              borderRadius: 8,
                              marginTop: 2,
                              backgroundColor: isCardPaid(card) ? 'rgba(122,158,126,0.15)' : 'rgba(192,138,91,0.1)',
                              borderWidth: 1,
                              borderColor: isCardPaid(card) ? 'rgba(122,158,126,0.4)' : 'rgba(192,138,91,0.3)',
                              opacity: pressed ? 0.7 : 1,
                            })}
                          >
                            <FontAwesome6
                              name={isCardPaid(card) ? 'check' : 'circle-check'}
                              size={10}
                              color={isCardPaid(card) ? '#7A9E7E' : '#C08A5B'}
                              iconStyle="solid"
                            />
                            <Text style={{ fontSize: 10, fontWeight: '600', color: isCardPaid(card) ? '#7A9E7E' : '#C08A5B' }}>
                              {isCardPaid(card) ? 'Paid' : 'Mark Paid'}
                            </Text>
                          </Pressable>
                        )}

                        {/* Plaid Connect button */}
                        {!card.plaidAccountId && (
                          <Pressable
                            onPress={() => handleConnectBank(card)}
                            disabled={connectingCardId === card.id}
                            style={({ pressed }) => ({
                              alignSelf: 'stretch' as const,
                              flexDirection: 'row' as const,
                              alignItems: 'center' as const,
                              justifyContent: 'center' as const,
                              gap: 4,
                              paddingVertical: 5,
                              borderRadius: 8,
                              marginTop: 4,
                              backgroundColor: 'rgba(122,158,126,0.1)',
                              borderWidth: 1,
                              borderColor: 'rgba(122,158,126,0.3)',
                              opacity: pressed || connectingCardId === card.id ? 0.5 : 1,
                            })}
                          >
                            <FontAwesome6 name="building-columns" size={9} color="#7A9E7E" iconStyle="solid" />
                            <Text style={{ fontSize: 9, fontWeight: '600', color: '#7A9E7E' }}>
                              {connectingCardId === card.id ? '...' : 'Connect'}
                            </Text>
                          </Pressable>
                        )}

                        {/* Plaid Sync button (linked card) */}
                        {card.plaidAccountId && (
                          <View style={{ alignSelf: 'stretch' as const, marginTop: 4, gap: 2 }}>
                            <Pressable
                              onPress={() => handleSyncCard(card)}
                              disabled={syncingCardId === card.id}
                              style={({ pressed }) => ({
                                flexDirection: 'row' as const,
                                alignItems: 'center' as const,
                                justifyContent: 'center' as const,
                                gap: 4,
                                paddingVertical: 5,
                                borderRadius: 8,
                                backgroundColor: card.lastSyncedAt ? 'rgba(122,158,126,0.15)' : 'rgba(122,158,126,0.1)',
                                borderWidth: 1,
                                borderColor: 'rgba(122,158,126,0.3)',
                                opacity: pressed || syncingCardId === card.id ? 0.5 : 1,
                              })}
                            >
                              <FontAwesome6
                                name={syncingCardId === card.id ? 'arrows-rotate' : card.lastSyncedAt ? 'building-columns' : 'arrows-rotate'}
                                size={9}
                                color="#7A9E7E"
                                iconStyle="solid"
                              />
                              <Text style={{ fontSize: 9, fontWeight: '600', color: '#7A9E7E' }}>
                                {syncingCardId === card.id ? 'Syncing' : card.lastSyncedAt ? 'Synced' : 'Sync'}
                              </Text>
                            </Pressable>
                          </View>
                        )}
                      </View>

                      <Pressable
                        style={({ pressed }) => [styles.cardInner, pressed && selectMode && styles.cardPressed]}
                        onPress={selectMode ? () => toggleSelect(card.id) : undefined}
                      >
                        {selectMode && (
                          <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                            {isSelected && <FontAwesome6 name="check" size={10} color="#fff" iconStyle="solid" />}
                          </View>
                        )}

                        <View style={styles.cardInfo}>
                          <View style={[styles.cardNameRow, isDesktop && styles.cardNameRowDesktop]}>
                            <Text style={[styles.cardName, isDesktop && styles.cardNameDesktop]} numberOfLines={isDesktop ? 1 : 2}>{isDesktop ? card.name : abbreviateCardName(card.name)}</Text>
                            <View style={styles.cardBadgeRow}>
                              {(() => {
                                const paid = isCardPaid(card);
                                const days = card.nextPaymentDue
                                  ? Math.ceil((new Date(card.nextPaymentDue + 'T00:00:00').getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000)
                                  : daysUntilDue(card.dueDay);
                                const urgent = !paid && days <= 10;
                                const dueLabel = card.nextPaymentDue
                                  ? ordinal(new Date(card.nextPaymentDue + 'T00:00:00').getDate())
                                  : ordinal(card.dueDay);
                                return (
                                  <View style={[styles.feeBadge, paid && { backgroundColor: 'rgba(122,158,126,0.15)', borderColor: 'rgba(122,158,126,0.4)', borderWidth: 1 }, urgent && styles.feeBadgeUrgent]}>
                                    {paid
                                      ? <FontAwesome6 name="check" size={10} color="#7A9E7E" iconStyle="solid" />
                                      : urgent
                                        ? <FontAwesome6 name="triangle-exclamation" size={10} color="#ff3b30" iconStyle="solid" />
                                        : null
                                    }
                                    <Text style={[styles.feeBadgeText, paid && { color: '#7A9E7E' }, urgent && styles.feeBadgeTextUrgent]}>
                                      {paid ? 'Paid' : `Statement Ends: ${dueLabel}`}
                                    </Text>
                                  </View>
                                );
                              })()}
                              {card.plaidAccountId && card.minimumPayment !== undefined && (
                                <View style={[styles.feeBadge, { backgroundColor: 'rgba(192,138,91,0.1)', borderWidth: 1, borderColor: 'rgba(192,138,91,0.3)' }]}>
                                  <Text style={[styles.feeBadgeText, { color: '#C08A5B' }]}>
                                    {`Min: $${card.minimumPayment.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                  </Text>
                                </View>
                              )}
                              {!card.plaidAccountId && card.limit ? (() => {
                                const limitNum = parseFloat(card.limit);
                                const available = limitNum - (spentByCard[card.id] ?? 0);
                                const nearLimit = limitNum > 0 && available <= limitNum * 0.10;
                                if (isNaN(limitNum)) return null;
                                return (
                                  <View style={[styles.feeBadge, { backgroundColor: nearLimit ? 'rgba(139,58,58,0.12)' : 'rgba(122,158,126,0.12)', borderWidth: 1, borderColor: nearLimit ? '#ff3b30' : 'rgba(122,158,126,0.4)' }]}>
                                    {nearLimit && <FontAwesome6 name="triangle-exclamation" size={10} color="#ff3b30" iconStyle="solid" />}
                                    <Text style={[styles.feeBadgeText, { color: nearLimit ? '#ff3b30' : '#7A9E7E' }]}>
                                      {`$${available.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} avail`}
                                    </Text>
                                  </View>
                                );
                              })() : null}
                            </View>
                          </View>

                          <Text style={styles.cardLast4}>•••• {card.lastFour}</Text>

                          {card.plaidAccountId && (card.currentBalance !== undefined || card.availableCredit !== undefined) && (() => {
                            const totalLine = (card.availableCredit ?? 0) + (card.currentBalance ?? 0);
                            const balPct = totalLine > 0 && card.currentBalance !== undefined ? card.currentBalance / totalLine : 0;
                            const balRed = balPct > 0.50;
                            const balCaution = !balRed && balPct > 0.30;
                            const balBg = balRed ? 'rgba(139,58,58,0.12)' : balCaution ? 'rgba(192,138,91,0.12)' : 'rgba(122,158,126,0.12)';
                            const balColor = balRed ? '#ff3b30' : balCaution ? '#C08A5B' : '#7A9E7E';
                            const balBorder = balRed ? '#ff3b30' : balCaution ? 'rgba(192,138,91,0.5)' : 'rgba(122,158,126,0.4)';
                            const availPct = totalLine > 0 && card.availableCredit !== undefined ? card.availableCredit / totalLine : 1;
                            const availRed = availPct < 0.30;
                            const availCaution = !availRed && availPct < 0.50;
                            const availBg = availRed ? 'rgba(139,58,58,0.12)' : availCaution ? 'rgba(192,138,91,0.12)' : 'rgba(122,158,126,0.12)';
                            const availColor = availRed ? '#ff3b30' : availCaution ? '#C08A5B' : '#7A9E7E';
                            const availBorder = availRed ? '#ff3b30' : availCaution ? 'rgba(192,138,91,0.5)' : undefined;
                            return (
                              <View style={{ gap: 4, marginTop: 4 }}>
                                {card.currentBalance !== undefined && (
                                  <View style={{ flexDirection: 'row' }}>
                                    <View style={{ backgroundColor: balBg, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: balBorder }}>
                                      {(balRed || balCaution) && <FontAwesome6 name="triangle-exclamation" size={10} color={balColor} iconStyle="solid" />}
                                      <Text style={{ fontSize: 10, color: balColor, fontWeight: '600' }}>
                                        {`Balance: $${card.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                      </Text>
                                    </View>
                                  </View>
                                )}
                                {card.availableCredit !== undefined && (
                                  <View style={{ flexDirection: 'row' }}>
                                    <View style={{ backgroundColor: availBg, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, flexDirection: 'row', alignItems: 'center', gap: 4, ...(availBorder && { borderWidth: 1, borderColor: availBorder }) }}>
                                      {(availRed || availCaution) && <FontAwesome6 name="triangle-exclamation" size={10} color={availColor} iconStyle="solid" />}
                                      <Text style={{ fontSize: 10, color: availColor, fontWeight: '600' }}>
                                        {`Available: $${card.availableCredit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                      </Text>
                                    </View>
                                  </View>
                                )}
                              </View>
                            );
                          })()}

                          {annualFee === 0 ? (
                            <View style={styles.noFeePill}>
                              <Text style={styles.noFeePillText}>No annual fee</Text>
                            </View>
                          ) : card.feeDueDate ? (
                            <View style={styles.renewalSection}>
                              {(() => {
                                const feeUrgent = daysUntilRenewal(card.feeDueDate) <= 10;
                                return (
                                  <>
                                    <View style={styles.renewalRow}>
                                      <Text style={styles.renewalLabel}>Next annual fee</Text>
                                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                        {feeUrgent && (
                                          <FontAwesome6 name="triangle-exclamation" size={10} color="#ff3b30" iconStyle="solid" />
                                        )}
                                        <Text style={[styles.daysText, feeUrgent && styles.daysTextUrgent]}>
                                          {daysUntilRenewal(card.feeDueDate)} days remaining
                                        </Text>
                                      </View>
                                    </View>
                                    <View style={styles.progressRow}>
                                      <View style={[styles.progressTrack, { flex: 1 }]}>
                                        <View
                                          style={[
                                            styles.progressFill,
                                            feeUrgent && styles.progressFillUrgent,
                                            { width: `${Math.round(renewalProgress(card.feeDueDate) * 100)}%` },
                                          ]}
                                        />
                                      </View>
                                      <Text style={styles.progressFeeLabel}>${annualFee}/yr</Text>
                                    </View>
                                  </>
                                );
                              })()}
                              <Text style={styles.renewalDateText}>{formatRenewalDate(card.feeDueDate)}</Text>
                            </View>
                          ) : (
                            <Text style={styles.setDateHint}>Add fee due date to track ${annualFee}/yr renewal</Text>
                          )}

                          {benefits.length > 0 && (() => {
                            const bonus = benefits.filter(b => b.category !== 'All Purchases').slice(0, 3);
                            const base = benefits.find(b => b.category === 'All Purchases');
                            const chips = base ? [...bonus, base] : bonus;
                            return (
                              <View style={styles.benefitsRow}>
                                {chips.map((b, i) => (
                                  <View key={i} style={[styles.benefitChip, b.category === 'All Purchases' && { backgroundColor: 'rgba(122,158,126,0.2)' }]}>
                                    <FontAwesome6 name={b.icon} size={10} color={b.category === 'All Purchases' ? '#7A9E7E' : '#6F4E37'} iconStyle="solid" />
                                    <Text style={[styles.benefitChipText, b.category === 'All Purchases' && { color: '#7A9E7E' }]}> {b.multiplier}</Text>
                                  </View>
                                ))}
                              </View>
                            );
                          })()}

                        </View>
                      </Pressable>

                      {!selectMode && (
                        <View style={{ alignSelf: 'stretch', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 4 }}>
                          <Pressable onPress={() => openEditModal(card)} hitSlop={8}>
                            {({ pressed }: { pressed: boolean }) => (
                              <FontAwesome6 name="ellipsis" size={16} color={pressed ? '#C08A5B' : '#8C6E5A'} iconStyle="solid" />
                            )}
                          </Pressable>
                          <Pressable onPress={() => handleDeleteOne(card.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            {({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => (
                              <FontAwesome6 name="trash" size={14} color={hovered || pressed ? '#ff0000' : '#ff3b30'} iconStyle="solid" />
                            )}
                          </Pressable>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>

          {selectMode ? (
            <View style={[styles.selectModeBar, { marginBottom: 10 }]}>
              <Text style={styles.selectedCount}>
                {selectedIds.size === 0 ? 'Tap cards to select' : `${selectedIds.size} selected`}
              </Text>
              <TouchableOpacity
                style={[styles.deleteSelectedButton, selectedIds.size === 0 && styles.deleteSelectedButtonDisabled]}
                onPress={handleDeleteSelected}
                disabled={selectedIds.size === 0}
                activeOpacity={0.75}
              >
                <Text style={[styles.deleteSelectedText, selectedIds.size === 0 && styles.deleteSelectedTextDisabled]}>
                  {selectedIds.size > 0 ? `Remove (${selectedIds.size})` : 'Remove'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Pressable
              style={({ pressed }) => [styles.addButton, { marginBottom: 10 }, pressed && styles.addButtonPressed]}
              onPress={openModal}
            >
              <Text style={styles.addButtonText}>+ Add Card</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* ── BENEFITS TAB ── */}
      {activeTab === 'benefits' && (
        <ScrollView style={ds.homeScroll} contentContainerStyle={ds.homeScrollContent} showsVerticalScrollIndicator={false}>

          <Text style={[ds.appTitle, { textAlign: 'left' }]}>Benefits</Text>

          {cards.length === 0 && (
            <View style={ds.homeEmpty}>
              <FontAwesome6 name="star" size={44} color="#CBB9A8" iconStyle="solid" />
              <Text style={ds.homeEmptyTitle}>No cards yet</Text>
              <Text style={ds.homeEmptySub}>Add cards to see your benefits breakdown</Text>
            </View>
          )}

          {/* Category filter dropdown */}
          {walletExplicitCategories.length > 0 && (
            <View style={{ backgroundColor: '#2B1D17', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(192,138,91,0.18)' }}>
              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 }}
                onPress={() => setBenefitFilterOpen(v => !v)}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <FontAwesome6 name="filter" size={13} color="#C08A5B" iconStyle="solid" />
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#F4EDE4' }}>
                    {benefitCategoryFilter === 'All' ? 'All Categories' : benefitCategoryFilter}
                  </Text>
                </View>
                <FontAwesome6 name={benefitFilterOpen ? 'chevron-up' : 'chevron-down'} size={12} color="#8C6E5A" iconStyle="solid" />
              </Pressable>
              {benefitFilterOpen && (
                <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)' }}>
                  {(['All', ...walletExplicitCategories] as string[]).map(cat => {
                    const active = benefitCategoryFilter === cat;
                    const meta = BENEFIT_CATEGORY_MAP[cat];
                    return (
                      <Pressable
                        key={cat}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: active ? 'rgba(192,138,91,0.15)' : 'transparent' }}
                        onPress={() => { setBenefitCategoryFilter(cat); setBenefitFilterOpen(false); }}
                      >
                        <View style={{ width: 22, alignItems: 'center' }}>
                          <FontAwesome6 name={cat === 'All' ? 'star' : (meta?.icon ?? 'circle')} size={13} color={active ? '#C08A5B' : '#6F4E37'} iconStyle="solid" />
                        </View>
                        <Text style={{ flex: 1, fontSize: 14, color: active ? '#C08A5B' : '#CBB9A8', fontWeight: active ? '700' : '400' }}>
                          {cat === 'All' ? 'All Categories' : cat}
                        </Text>
                        {active && <FontAwesome6 name="check" size={12} color="#C08A5B" iconStyle="solid" />}
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {/* Benefits grid — All categories */}
          {benefitCategoryFilter === 'All' && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>

            {/* Rotating / Choice */}
            {rotatingBenefitItems.length > 0 && (
              <View style={{ width: catCardWidth, backgroundColor: '#2B1D17', borderRadius: 16, padding: 14, gap: 12, borderWidth: 1, borderColor: 'rgba(192,138,91,0.2)', shadowColor: '#C08A5B', shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 3 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(192,138,91,0.15)', justifyContent: 'center', alignItems: 'center' }}>
                    <FontAwesome6 name="arrows-rotate" size={14} color="#C08A5B" iconStyle="solid" />
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#F4EDE4' }}>Rotating / Choice</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: 'rgba(192,138,91,0.08)', borderRadius: 10, padding: 8 }}>
                  <FontAwesome6 name="circle-info" size={11} color="#8C6E5A" iconStyle="solid" />
                  <Text style={{ flex: 1, fontSize: 10, color: '#8C6E5A', lineHeight: 15 }}>
                    Check your card's app for the current quarter's categories
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 12 }}>
                  {rotatingBenefitItems.map((item, i) => (
                    <View key={`${item.card.id}-rot-${i}`} style={{ alignItems: 'center', gap: 6 }}>
                      <View style={{ width: benefitImgWidth, height: benefitImgHeight, borderRadius: 9, backgroundColor: item.card.color, overflow: 'hidden' }}>
                        {item.catalog.image ? (
                          <Image source={item.catalog.image} style={{ width: benefitImgWidth, height: benefitImgHeight }} resizeMode="cover" />
                        ) : null}
                        {item.catalog.url && (
                          <Pressable
                            style={{ position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: 5, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' }}
                            onPress={() => Linking.openURL(item.catalog.url!)}
                            hitSlop={4}
                          >
                            <FontAwesome6 name="arrow-up-right-from-square" size={8} color="#fff" iconStyle="solid" />
                          </Pressable>
                        )}
                      </View>
                      <View style={{ backgroundColor: 'rgba(192,138,91,0.2)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#C08A5B' }}>{item.benefit.multiplier}</Text>
                      </View>
                      {item.card.lastFour ? <Text style={{ fontSize: 9, color: '#6F4E37' }}>••{item.card.lastFour}</Text> : null}
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Per-category cards */}
            {walletExplicitCategories.map(cat => {
              const catItems = explicitBenefitItems
                .filter(item => normalizeCategory(item.benefit.category) === cat)
                .sort((a, b) => parseMultiplier(b.benefit.multiplier) - parseMultiplier(a.benefit.multiplier));
              const catMeta = BENEFIT_CATEGORY_MAP[cat];
              const tiers = buildTiers(catItems);
              return (
                <View key={cat} style={{ width: catCardWidth, backgroundColor: '#2B1D17', borderRadius: 16, padding: 14, gap: 12, borderWidth: 1, borderColor: 'rgba(192,138,91,0.2)', shadowColor: '#C08A5B', shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(192,138,91,0.15)', justifyContent: 'center', alignItems: 'center' }}>
                      {catMeta && <FontAwesome6 name={catMeta.icon} size={14} color="#C08A5B" iconStyle="solid" />}
                    </View>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#F4EDE4' }}>{catMeta?.display ?? cat}</Text>
                  </View>
                  {tiers.map((tier, tierIdx) => (
                    <View key={tierIdx} style={tierIdx === 0 && tiers.length === 1 ? { flex: 1, justifyContent: 'center' } : undefined}>
                      {tierIdx === 0 ? (
                        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
                          {tier.items.map(item => (
                            <View key={item.card.id} style={{ alignItems: 'center', gap: 6 }}>
                              <View style={{ width: benefitImgWidth, height: benefitImgHeight, borderRadius: 9, backgroundColor: item.card.color, overflow: 'hidden' }}>
                                {item.catalog.image ? (
                                  <Image source={item.catalog.image} style={{ width: benefitImgWidth, height: benefitImgHeight }} resizeMode="cover" />
                                ) : null}
                                {item.catalog.url && (
                                  <Pressable
                                    style={{ position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: 5, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' }}
                                    onPress={() => Linking.openURL(item.catalog.url!)}
                                    hitSlop={4}
                                  >
                                    <FontAwesome6 name="arrow-up-right-from-square" size={8} color="#fff" iconStyle="solid" />
                                  </Pressable>
                                )}
                              </View>
                              <View style={{ backgroundColor: 'rgba(192,138,91,0.2)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                                <Text style={{ fontSize: 13, fontWeight: '700', color: '#C08A5B' }}>{tier.multiplier}</Text>
                              </View>
                              {item.card.lastFour ? <Text style={{ fontSize: 9, color: '#6F4E37', textAlign: 'center' }}>••{item.card.lastFour}</Text> : null}
                            </View>
                          ))}
                        </View>
                      ) : (
                        <View style={{ gap: 5, paddingTop: 4 }}>
                          <View style={{ height: 1, backgroundColor: 'rgba(192,138,91,0.18)', marginBottom: 2 }} />
                          <Text style={{ fontSize: 9, fontWeight: '700', color: '#6F4E37', letterSpacing: 0.8 }}>RUNNER-UP</Text>
                          {tier.items.map(item => (
                            <View key={item.card.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.card.color, flexShrink: 0 }} />
                              <Text style={{ flex: 1, fontSize: 12, color: '#8C6E5A' }} numberOfLines={1}>
                                {isDesktop ? item.card.name : abbreviateCardName(item.card.name)}{item.card.lastFour ? ` ••${item.card.lastFour}` : ''}
                              </Text>
                              {item.catalog.url && (
                                <Pressable onPress={() => Linking.openURL(item.catalog.url!)} hitSlop={8}>
                                  <FontAwesome6 name="arrow-up-right-from-square" size={10} color="#6F4E37" iconStyle="solid" />
                                </Pressable>
                              )}
                              <Text style={{ fontSize: 12, fontWeight: '600', color: '#6F4E37' }}>{tier.multiplier}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              );
            })}

            {/* All Purchases base rate */}
            {allPurchasesBenefitItems.length > 0 && (
              <View style={{ width: catCardWidth, backgroundColor: '#2B1D17', borderRadius: 16, padding: 14, gap: 12, borderWidth: 1, borderColor: 'rgba(122,158,126,0.2)', shadowColor: '#7A9E7E', shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 3 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(122,158,126,0.15)', justifyContent: 'center', alignItems: 'center' }}>
                    <FontAwesome6 name="money-bill" size={14} color="#7A9E7E" iconStyle="solid" />
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#F4EDE4' }}>All Purchases</Text>
                </View>
                {allPurchasesTiers.map((tier, tierIdx) => (
                  <View key={tierIdx} style={tierIdx === 0 && allPurchasesTiers.length === 1 ? { flex: 1, justifyContent: 'center' } : undefined}>
                    {tierIdx === 0 ? (
                      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
                        {tier.items.map(item => (
                          <View key={item.card.id} style={{ alignItems: 'center', gap: 6 }}>
                            <View style={{ width: benefitImgWidth, height: benefitImgHeight, borderRadius: 9, backgroundColor: item.card.color, overflow: 'hidden' }}>
                              {item.catalog.image ? (
                                <Image source={item.catalog.image} style={{ width: benefitImgWidth, height: benefitImgHeight }} resizeMode="cover" />
                              ) : null}
                              {item.catalog.url && (
                                <Pressable
                                  style={{ position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: 5, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' }}
                                  onPress={() => Linking.openURL(item.catalog.url!)}
                                  hitSlop={4}
                                >
                                  <FontAwesome6 name="arrow-up-right-from-square" size={8} color="#fff" iconStyle="solid" />
                                </Pressable>
                              )}
                            </View>
                            <View style={{ backgroundColor: 'rgba(122,158,126,0.2)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                              <Text style={{ fontSize: 13, fontWeight: '700', color: '#7A9E7E' }}>{tier.multiplier}</Text>
                            </View>
                            {item.card.lastFour ? <Text style={{ fontSize: 9, color: '#6F4E37', textAlign: 'center' }}>••{item.card.lastFour}</Text> : null}
                          </View>
                        ))}
                      </View>
                    ) : (
                      <View style={{ gap: 5, paddingTop: 4 }}>
                        <View style={{ height: 1, backgroundColor: 'rgba(192,138,91,0.18)', marginBottom: 2 }} />
                        <Text style={{ fontSize: 9, fontWeight: '700', color: '#6F4E37', letterSpacing: 0.8 }}>RUNNER-UP</Text>
                        {tier.items.map(item => (
                          <View key={item.card.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.card.color, flexShrink: 0 }} />
                            <Text style={{ flex: 1, fontSize: 12, color: '#8C6E5A' }} numberOfLines={1}>
                              {isDesktop ? item.card.name : abbreviateCardName(item.card.name)}{item.card.lastFour ? ` ••${item.card.lastFour}` : ''}
                            </Text>
                            {item.catalog.url && (
                              <Pressable onPress={() => Linking.openURL(item.catalog.url!)} hitSlop={8}>
                                <FontAwesome6 name="arrow-up-right-from-square" size={10} color="#6F4E37" iconStyle="solid" />
                              </Pressable>
                            )}
                            <Text style={{ fontSize: 12, fontWeight: '600', color: '#6F4E37' }}>{tier.multiplier}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}

          </View>
          )}

          {/* Filtered category — full ranking */}
          {benefitCategoryFilter !== 'All' && (
            <View style={{ backgroundColor: '#2B1D17', borderRadius: 16, padding: 16, gap: 14, borderWidth: 1, borderColor: 'rgba(192,138,91,0.2)', shadowColor: '#C08A5B', shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(192,138,91,0.15)', justifyContent: 'center', alignItems: 'center' }}>
                  {filteredCatMeta && <FontAwesome6 name={filteredCatMeta.icon} size={14} color="#C08A5B" iconStyle="solid" />}
                </View>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#F4EDE4' }}>{filteredCatMeta?.display ?? benefitCategoryFilter}</Text>
                <Text style={{ fontSize: 12, color: '#6F4E37', marginLeft: 2 }}>— ranked</Text>
              </View>
              {filteredCatItems.length === 0 ? (
                <Text style={{ fontSize: 13, color: '#8C6E5A' }}>No cards in your wallet earn for this category.</Text>
              ) : (
                filteredCatItems.map((item) => {
                  const rank = filteredCatItems.filter(i => parseMultiplier(i.benefit.multiplier) > parseMultiplier(item.benefit.multiplier)).length + 1;
                  const isTop = rank === 1;
                  const accentColor = isTop ? '#C08A5B' : rank === 2 ? '#8C6E5A' : '#6F4E37';
                  return (
                    <View key={item.card.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <Text style={{ width: 28, fontSize: 13, fontWeight: '700', color: accentColor, textAlign: 'center' }}>#{rank}</Text>
                      <View style={{ width: 64, height: 40, borderRadius: 6, backgroundColor: item.card.color, overflow: 'hidden', flexShrink: 0 }}>
                        {item.catalog.image ? (
                          <Image source={item.catalog.image} style={{ width: 64, height: 40 }} resizeMode="cover" />
                        ) : null}
                      </View>
                      <Text style={{ flex: 1, fontSize: 13, color: '#F4EDE4', fontWeight: '500' }} numberOfLines={1}>
                        {isDesktop ? item.card.name : abbreviateCardName(item.card.name)}{item.card.lastFour ? ` ••${item.card.lastFour}` : ''}
                      </Text>
                      {item.catalog.url && (
                        <Pressable onPress={() => Linking.openURL(item.catalog.url!)} hitSlop={8}>
                          <FontAwesome6 name="arrow-up-right-from-square" size={10} color="#6F4E37" iconStyle="solid" />
                        </Pressable>
                      )}
                      <View style={{ backgroundColor: isTop ? 'rgba(192,138,91,0.2)' : 'rgba(255,255,255,0.06)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: accentColor }}>{item.benefit.multiplier}</Text>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}
        </ScrollView>
      )}

      {/* ── MORE TAB ── */}
      {activeTab === 'more' && (
        <ScrollView style={ds.homeScroll} contentContainerStyle={ds.homeScrollContent}>
          <Text style={[ds.appTitle, { textAlign: 'left' }]}>More</Text>

          <View style={ds.sectionCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(0,122,255,0.12)', justifyContent: 'center', alignItems: 'center' }}>
                <FontAwesome6 name="building-columns" size={16} color="#007aff" iconStyle="solid" />
              </View>
              <Text style={[ds.sectionTitle, { marginBottom: 0 }]}>Connect Your Bank</Text>
            </View>

            <Text style={{ fontSize: 13, color: '#6F4E37', lineHeight: 20 }}>
              Link your bank or credit card account to automatically import real transactions instead of logging them manually.
            </Text>

            <Pressable
              onPress={handleConnectBankMore}
              disabled={connectingBank}
              style={({ pressed }) => ({
                marginTop: 4,
                paddingVertical: 13,
                borderRadius: 12,
                alignItems: 'center' as const,
                backgroundColor: pressed || connectingBank ? 'rgba(0,122,255,0.18)' : 'rgba(0,122,255,0.1)',
                borderWidth: 1,
                borderColor: 'rgba(0,122,255,0.3)',
              })}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#007aff' }}>
                {connectingBank ? 'Connecting…' : 'Connect Bank Account'}
              </Text>
            </Pressable>
          </View>

          <View style={ds.sectionCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,59,48,0.12)', justifyContent: 'center', alignItems: 'center' }}>
                <FontAwesome6 name="trash-can" size={16} color="#ff3b30" iconStyle="solid" />
              </View>
              <Text style={[ds.sectionTitle, { marginBottom: 0 }]}>Clear All Data</Text>
            </View>

            <Text style={{ fontSize: 13, color: '#6F4E37', lineHeight: 20 }}>
              This will permanently remove all of your saved cards and every purchase you have logged. Your card catalog preferences, spending history, and payment records will all be erased and cannot be recovered.
            </Text>
            <Text style={{ fontSize: 13, color: '#8C6E5A', lineHeight: 20 }}>
              Use this if you want to start fresh or remove all personal data from the app.
            </Text>

            <Pressable
              onPress={handleClearAllData}
              style={({ pressed }) => ({
                marginTop: 4,
                paddingVertical: 13,
                borderRadius: 12,
                alignItems: 'center' as const,
                backgroundColor: pressed ? 'rgba(255,59,48,0.18)' : 'rgba(255,59,48,0.1)',
                borderWidth: 1,
                borderColor: 'rgba(255,59,48,0.3)',
              })}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#ff3b30' }}>Clear All Data</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}

      {/* ── BOTTOM TAB BAR ── */}
      <View style={ds.tabBar}>
        {([
          { key: 'home', icon: 'house', label: 'Home' },
          { key: 'cards', icon: 'credit-card', label: 'Cards' },
        ] as const).map((tab) => {
          const active = activeTab === tab.key;
          return (
            <Pressable key={tab.key} style={ds.tabItem} onPress={() => handleTabPress(tab.key)}>
              <View style={[ds.tabIconWrap, active && ds.tabIconActive]}>
                <FontAwesome6 name={tab.icon} size={20} color={active ? '#C08A5B' : '#CBB9A8'} iconStyle="solid" />
              </View>
              <Text style={[ds.tabLabel, active && ds.tabLabelActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}

        {/* Center FAB */}
        <View style={ds.tabCenterWrap}>
          <Pressable
            style={({ pressed }) => [ds.tabCenterBtn, pressed && ds.tabCenterBtnPressed]}
            onPress={openPurchaseModal}
          >
            <FontAwesome6 name="plus" size={26} color="#fff" iconStyle="solid" />
          </Pressable>
        </View>

        {([
          { key: 'benefits', icon: 'star', label: 'Benefits' },
          { key: 'more', icon: 'ellipsis', label: 'More' },
        ] as const).map((tab) => {
          const active = activeTab === tab.key;
          return (
            <Pressable key={tab.key} style={ds.tabItem} onPress={() => handleTabPress(tab.key)}>
              <View style={[ds.tabIconWrap, active && ds.tabIconActive]}>
                <FontAwesome6 name={tab.icon} size={20} color={active ? '#C08A5B' : '#CBB9A8'} iconStyle="solid" />
              </View>
              <Text style={[ds.tabLabel, active && ds.tabLabelActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* ── ADD CARD MODAL ── */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { height: windowHeight * 0.92 }]}>
            <View style={styles.dragHandle} />

            <Animated.View style={{ flex: 1, opacity: stepAnim }}>
              {step === 'pick' ? (
                <View style={{ flex: 1 }}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Choose a Card</Text>
                    <Pressable onPress={() => setModalVisible(false)} hitSlop={8}>
                      <Text style={styles.closeButton}>✕</Text>
                    </Pressable>
                  </View>

                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search cards..."
                    placeholderTextColor="#aeaeb2"
                    value={search}
                    onChangeText={setSearch}
                  />

                  <View style={styles.issuerFilterRow}>
                    {ISSUERS.map((issuer) => (
                      <Pressable
                        key={issuer}
                        style={[styles.issuerPill, issuerFilter === issuer && styles.issuerPillActive]}
                        onPress={() => setIssuerFilter(issuer)}
                      >
                        <Text style={[styles.issuerPillText, issuerFilter === issuer && styles.issuerPillTextActive]}>
                          {issuer}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  <ScrollView style={styles.catalogList} showsVerticalScrollIndicator={false}>
                    {filteredCatalog.map((card) => (
                      <Pressable
                        key={card.id}
                        style={({ pressed }) => [styles.catalogItem, pressed && styles.catalogItemPressed]}
                        onPress={() => pickCard(card)}
                      >
                        <View style={[styles.catalogImageWrap, { backgroundColor: card.color }]}>
                          {card.image
                            ? <Image source={card.image} style={styles.catalogImage} resizeMode="cover" />
                            : <Text style={styles.catalogCustomLabel}>Custom</Text>
                          }
                        </View>
                        <View style={styles.catalogItemInfo}>
                          <Text style={styles.catalogCardName}>{card.name}</Text>
                          <Text style={styles.catalogCardIssuer}>{card.issuer}</Text>
                        </View>
                        {card.annualFee > 0 && (
                          <View style={styles.catalogFeeBadge}>
                            <Text style={styles.catalogFeeBadgeText}>${card.annualFee}/yr</Text>
                          </View>
                        )}
                        <Text style={styles.chevron}>›</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              ) : (
                <KeyboardAvoidingView
                  style={{ flex: 1 }}
                  behavior={undefined}
                >
                  <View style={styles.modalHeader}>
                    <Pressable onPress={goBack} hitSlop={8}>
                      <Text style={styles.backButton}>‹  Back</Text>
                    </Pressable>
                    <Pressable onPress={() => setModalVisible(false)} hitSlop={8}>
                      <Text style={styles.closeButton}>✕</Text>
                    </Pressable>
                  </View>

                  <View style={styles.detailsRow}>
                    <View style={styles.detailsLeft}>
                      <View style={[styles.detailThumb, { backgroundColor: selectedCard?.color }]}>
                        {selectedCard?.image
                          ? <Image source={selectedCard.image} style={styles.detailThumbImage} resizeMode="cover" />
                          : <Text style={styles.customCardLabel}>{form.customName || 'Custom'}</Text>
                        }
                      </View>
                      <Text style={styles.detailCardName} numberOfLines={3}>
                        {selectedCard?.id === 'custom'
                          ? (form.customName || 'Custom Card')
                          : selectedCard?.name}
                      </Text>
                      {selectedCard && selectedCard.annualFee > 0 && (
                        <View style={styles.detailFeePill}>
                          <Text style={styles.detailFeePillText}>${selectedCard.annualFee}/yr</Text>
                        </View>
                      )}
                      {selectedCard && selectedCard.annualFee === 0 && (
                        <View style={styles.detailNoFeePill}>
                          <Text style={styles.detailNoFeePillText}>No annual fee</Text>
                        </View>
                      )}
                    </View>

                    <ScrollView
                      style={styles.detailsRight}
                      showsVerticalScrollIndicator={false}
                      keyboardShouldPersistTaps="handled"
                    >
                      {selectedCard?.id === 'custom' && (
                        <>
                          <Text style={styles.inputLabel}>Card Name</Text>
                          <TextInput
                            style={styles.input}
                            placeholder="e.g. My Store Card"
                            placeholderTextColor="#aeaeb2"
                            value={form.customName}
                            onChangeText={(v) => setForm((f) => ({ ...f, customName: v }))}
                          />
                        </>
                      )}

                      <Text style={styles.inputLabel}>Last 4 Digits</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="4821"
                        placeholderTextColor="#aeaeb2"
                        keyboardType="numeric"
                        maxLength={4}
                        value={form.lastFour}
                        onChangeText={(v) => setForm((f) => ({ ...f, lastFour: v }))}
                      />

                      <Text style={styles.inputLabel}>Card Opened (MM/YYYY)</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="04/2023"
                        placeholderTextColor="#aeaeb2"
                        keyboardType="numeric"
                        value={form.memberSince}
                        onChangeText={(v) => setForm((f) => ({ ...f, memberSince: formatMemberSince(v) }))}
                      />

                      {selectedCard && selectedCard.annualFee > 0 && (
                        <>
                          <Text style={styles.inputLabel}>Fee Due Date (MM/DD)</Text>
                          <TextInput
                            style={styles.input}
                            placeholder="05/09"
                            placeholderTextColor="#aeaeb2"
                            keyboardType="numeric"
                            value={form.feeDueDate}
                            onChangeText={(v) => setForm((f) => ({ ...f, feeDueDate: formatFeeDueDateInput(v) }))}
                          />
                        </>
                      )}

                      {selectedCard && selectedCard.benefits.length > 0 && (
                        <>
                          <Text style={styles.benefitsGridLabel}>Benefits</Text>
                          <View style={styles.benefitsGrid}>
                            {selectedCard.benefits.map((b, i) => (
                              <View key={i} style={styles.benefitCol}>
                                <Text style={styles.benefitColLabel}>{b.category}</Text>
                                <View style={styles.benefitColPill}>
                                  <FontAwesome6 name={b.icon} size={13} color="#C08A5B" iconStyle="solid" />
                                  <Text style={styles.benefitColPillText}>{b.multiplier}</Text>
                                </View>
                              </View>
                            ))}
                          </View>
                        </>
                      )}
                    </ScrollView>
                  </View>

                  {saveError !== '' && (
                    <Text style={styles.saveErrorText}>{saveError}</Text>
                  )}

                  <View style={styles.modalButtons}>
                    <Pressable
                      style={({ pressed }) => [styles.cancelButton, pressed && styles.cancelButtonPressed]}
                      onPress={() => setModalVisible(false)}
                    >
                      <Text style={styles.cancelButtonText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [styles.saveButton, pressed && styles.saveButtonPressed]}
                      onPress={saveCard}
                    >
                      <Text style={styles.saveButtonText}>Save Card</Text>
                    </Pressable>
                  </View>
                </KeyboardAvoidingView>
              )}
            </Animated.View>
          </View>
        </View>
      </Modal>

      {/* ── ADD PURCHASE MODAL ── */}
      <Modal visible={purchaseModalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={undefined}
        >
          <View style={[styles.modalSheet, { maxHeight: windowHeight * 0.88 }]}>
            <View style={styles.dragHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Purchase</Text>
              <Pressable onPress={() => setPurchaseModalVisible(false)} hitSlop={8}>
                <Text style={styles.closeButton}>✕</Text>
              </Pressable>
            </View>

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Card picker */}
              <Text style={styles.inputLabel}>Card Used</Text>
              {cards.length === 0 ? (
                <Text style={{ color: '#aeaeb2', fontSize: 13, marginBottom: 12 }}>No cards added yet</Text>
              ) : (
                <View style={{ gap: 8, marginBottom: 16 }}>
                  {cards.map(card => (
                    <Pressable
                      key={card.id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                        backgroundColor: purchaseForm.cardId === card.id ? 'rgba(192,138,91,0.18)' : '#2B1D17',
                        borderRadius: 12,
                        padding: 12,
                        borderWidth: 1.5,
                        borderColor: purchaseForm.cardId === card.id ? '#C08A5B' : 'transparent',
                      }}
                      onPress={() => setPurchaseForm(f => ({ ...f, cardId: card.id }))}
                    >
                      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: card.color }} />
                      <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: '#F8F4EF' }} numberOfLines={1}>
                        {card.name}
                      </Text>
                      {card.lastFour ? (
                        <Text style={{ fontSize: 12, color: '#8C6E5A' }}>••{card.lastFour}</Text>
                      ) : null}
                      {purchaseForm.cardId === card.id && (
                        <FontAwesome6 name="check" size={12} color="#C08A5B" iconStyle="solid" />
                      )}
                    </Pressable>
                  ))}
                </View>
              )}

              {/* Amount */}
              <Text style={styles.inputLabel}>Amount</Text>
              <TextInput
                style={styles.input}
                placeholder="$0.00"
                placeholderTextColor="#aeaeb2"
                keyboardType="decimal-pad"
                value={purchaseForm.amount}
                onChangeText={(v) => setPurchaseForm(f => ({ ...f, amount: formatPurchaseAmount(v) }))}
              />

              {/* Merchant */}
              <Text style={styles.inputLabel}>Merchant</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Whole Foods"
                placeholderTextColor="#aeaeb2"
                value={purchaseForm.merchant}
                onChangeText={(v) => setPurchaseForm(f => ({ ...f, merchant: v }))}
              />

              {/* Category */}
              <Text style={styles.inputLabel}>Category</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {([
                  { key: 'food', icon: 'utensils', label: 'Food & Dining' },
                  { key: 'grocery', icon: 'basket-shopping', label: 'Grocery' },
                  { key: 'gas', icon: 'gas-pump', label: 'Gas' },
                  { key: 'travel', icon: 'plane', label: 'Travel' },
                  { key: 'online', icon: 'cart-shopping', label: 'Online' },
                  { key: 'store', icon: 'bag-shopping', label: 'In-Store' },
                ] as const).map(cat => {
                  const active = purchaseForm.category === cat.key;
                  return (
                    <Pressable
                      key={cat.key}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        backgroundColor: active ? '#C08A5B' : '#2B1D17',
                        borderRadius: 10,
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                        borderWidth: 1,
                        borderColor: active ? '#C08A5B' : 'transparent',
                      }}
                      onPress={() => setPurchaseForm(f => ({ ...f, category: cat.key }))}
                    >
                      <FontAwesome6 name={cat.icon} size={14} color={active ? '#fff' : '#CBB9A8'} iconStyle="solid" />
                      <Text style={{ fontSize: 13, fontWeight: '600', color: active ? '#fff' : '#CBB9A8' }}>
                        {cat.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Date */}
              <Text style={styles.inputLabel}>Date Purchased (MM/DD/YYYY)</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="05/09/2026"
                  placeholderTextColor="#aeaeb2"
                  keyboardType="numeric"
                  value={purchaseForm.date}
                  onChangeText={(v) => setPurchaseForm(f => ({ ...f, date: formatDateInput(v) }))}
                />
                <Pressable
                  onPress={() => setCalendarVisible(true)}
                  style={({ pressed }) => ({
                    width: 44, height: 44, borderRadius: 12,
                    backgroundColor: pressed ? '#EDE1D4' : '#F4EDE4',
                    borderWidth: 1, borderColor: '#CBB9A8',
                    justifyContent: 'center', alignItems: 'center',
                  })}
                >
                  <FontAwesome6 name="calendar-days" size={16} color="#6F4E37" iconStyle="solid" />
                </Pressable>
              </View>
              {calendarVisible && (
                <CalendarPicker
                  value={purchaseForm.date}
                  onSelect={(v) => setPurchaseForm(f => ({ ...f, date: v }))}
                  onClose={() => setCalendarVisible(false)}
                />
              )}

              {purchaseError !== '' && (
                <Text style={styles.saveErrorText}>{purchaseError}</Text>
              )}
            </ScrollView>

            <View style={styles.modalButtons}>
              <Pressable
                style={({ pressed }) => [styles.cancelButton, pressed && styles.cancelButtonPressed]}
                onPress={() => setPurchaseModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.saveButton, pressed && styles.saveButtonPressed]}
                onPress={savePurchase}
              >
                <Text style={styles.saveButtonText}>Save Purchase</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── EDIT CARD MODAL ── */}
      <Modal visible={editModalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={undefined}
        >
          <View style={[styles.modalSheet, { maxHeight: windowHeight * 0.85 }]}>
            <View style={styles.dragHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Card</Text>
              <Pressable onPress={() => setEditModalVisible(false)} hitSlop={8}>
                <Text style={styles.closeButton}>✕</Text>
              </Pressable>
            </View>

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {editingCard && (() => {
                const catalogEntry = CARD_CATALOG.find(c => c.id === editingCard.catalogId);
                const hasFee = (catalogEntry?.annualFee ?? 0) > 0;
                const isCustom = editingCard.catalogId === 'custom';
                return (
                  <>
                    {isCustom && (
                      <>
                        <Text style={styles.inputLabel}>Card Name</Text>
                        <TextInput
                          style={styles.input}
                          placeholder="e.g. My Store Card"
                          placeholderTextColor="#aeaeb2"
                          value={editForm.customName}
                          onChangeText={(v) => setEditForm(f => ({ ...f, customName: v }))}
                        />
                      </>
                    )}

                    <Text style={styles.inputLabel}>Last 4 Digits</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="4821"
                      placeholderTextColor="#aeaeb2"
                      keyboardType="numeric"
                      maxLength={4}
                      value={editForm.lastFour}
                      onChangeText={(v) => setEditForm(f => ({ ...f, lastFour: v }))}
                    />

                    <Text style={styles.inputLabel}>Card Opened (MM/YYYY)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="04/2023"
                      placeholderTextColor="#aeaeb2"
                      keyboardType="numeric"
                      value={editForm.memberSince}
                      onChangeText={(v) => setEditForm(f => ({ ...f, memberSince: formatMemberSince(v) }))}
                    />

                    {hasFee && (
                      <>
                        <Text style={styles.inputLabel}>Fee Due Date (MM/DD)</Text>
                        <TextInput
                          style={styles.input}
                          placeholder="05/09"
                          placeholderTextColor="#aeaeb2"
                          keyboardType="numeric"
                          value={editForm.feeDueDate}
                          onChangeText={(v) => setEditForm(f => ({ ...f, feeDueDate: formatFeeDueDateInput(v) }))}
                        />
                      </>
                    )}

                    {editError !== '' && (
                      <Text style={styles.saveErrorText}>{editError}</Text>
                    )}
                  </>
                );
              })()}
            </ScrollView>

            <View style={styles.modalButtons}>
              <Pressable
                style={({ pressed }) => [styles.cancelButton, pressed && styles.cancelButtonPressed]}
                onPress={() => setEditModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.saveButton, pressed && styles.saveButtonPressed]}
                onPress={saveEdit}
              >
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── ICON LEGEND MODAL ── */}
      <Modal visible={legendVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { maxHeight: windowHeight * 0.88 }]}>
            <View style={styles.dragHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Legend</Text>
              <Pressable onPress={() => setLegendVisible(false)} hitSlop={8}>
                <Text style={styles.closeButton}>✕</Text>
              </Pressable>
            </View>

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28 }}
              showsVerticalScrollIndicator={false}
            >
              {/* ── Benefit Icon Legend ── */}
              <Text style={[styles.inputLabel, { marginBottom: 10 }]}>Benefits Icons</Text>
              <View style={{
                backgroundColor: '#2B1D17',
                borderRadius: 16,
                padding: 14,
                gap: 10,
              }}>
                {BENEFIT_LEGEND.map((item, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      backgroundColor: 'rgba(192,138,91,0.15)',
                      justifyContent: 'center',
                      alignItems: 'center',
                      flexShrink: 0,
                    }}>
                      <FontAwesome6 name={item.icon} size={15} color="#C08A5B" iconStyle="solid" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#F8F4EF', marginBottom: 1 }}>
                        {item.label}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#8C6E5A', lineHeight: 15 }}>
                        {item.description}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = { ...layoutStyles, ...cardStyles, ...modalStyles };
