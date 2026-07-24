'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle,
  FileText,
  Globe,
  ImagePlus,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Shuffle,
  Ticket,
  Users,
} from 'lucide-react';
import { createAdminEvent, uploadAdminEventBanner } from '@/lib/api';
import { LocationMapPicker } from '@/components/admin/LocationMapPicker';

const labelTiny = 'text-[10px] font-mono uppercase tracking-wider text-silver';
const inputLarge =
  'w-full px-3 py-3 text-sm sm:text-base border border-mist rounded-lg bg-paper text-ink placeholder:text-silver/60 focus:outline-none focus:border-ink/30 focus:ring-1 focus:ring-ink/10 transition-colors';
const dateTimeInput =
  'flex-1 min-w-0 px-3 py-2.5 text-sm border border-mist rounded-lg bg-paper text-ink font-mono focus:outline-none focus:border-ink/30 focus:ring-1 focus:ring-ink/10';

const THEME_OPTIONS = ['Minimal', 'Music', 'Sports', 'Conference', 'Festival', 'Workshop', 'Other'];

function defaultStartParts() {
  const now = new Date();
  now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0);
  return {
    date: now.toISOString().slice(0, 10),
    time: now.toTimeString().slice(0, 5),
  };
}

function combineDateTime(date: string, time: string): Date | null {
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function formatDateLabel(dateStr: string) {
  if (!dateStr) return 'Select date';
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTimeLabel(timeStr: string) {
  if (!timeStr) return 'Select time';
  const d = new Date(`2000-01-01T${timeStr}`);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

interface CreateEventFormProps {
  onClose: () => void;
}

export function CreateEventForm({ onClose }: CreateEventFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startDefaults = defaultStartParts();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(startDefaults.date);
  const [startTime, setStartTime] = useState(startDefaults.time);
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [venueName, setVenueName] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [category, setCategory] = useState('Minimal');
  const [ageRestriction, setAgeRestriction] = useState('');
  const [tags, setTags] = useState('');
  const [zones, setZones] = useState('');
  const [resaleEnabled, setResaleEnabled] = useState(false);
  const [usePriceCap, setUsePriceCap] = useState(false);
  const [resalePriceCapPercent, setResalePriceCapPercent] = useState(150);
  const [useResaleRoyalty, setUseResaleRoyalty] = useState(false);
  const [resaleRoyaltyPercent, setResaleRoyaltyPercent] = useState(5);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [editingResaleCap, setEditingResaleCap] = useState(false);
  const [editingResaleRoyalty, setEditingResaleRoyalty] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const timeZoneInfo = useMemo(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const offsetMin = -new Date().getTimezoneOffset();
    const sign = offsetMin >= 0 ? '+' : '-';
    const abs = Math.abs(offsetMin);
    const hrs = String(Math.floor(abs / 60)).padStart(2, '0');
    const mins = String(abs % 60).padStart(2, '0');
    const city = tz.split('/').pop()?.replace(/_/g, ' ') ?? tz;
    return { tz, label: `GMT${sign}${hrs}:${mins}`, city };
  }, []);

  const handleImagePick = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setFormError('Please choose an image file (PNG, JPG, WebP).');
      return;
    }
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setFormError(null);
  };

  const shuffleTheme = () => {
    const others = THEME_OPTIONS.filter((t) => t !== category);
    const pick = others[Math.floor(Math.random() * others.length)] ?? 'Minimal';
    setCategory(pick);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !venueName.trim() || !city.trim()) {
      setFormError('Event name, venue, and city are required.');
      return;
    }

    const start = combineDateTime(startDate, startTime);
    if (!start) {
      setFormError('Enter a valid start date and time.');
      return;
    }

    let endIso: string | undefined;
    if (endDate || endTime) {
      const end = combineDateTime(endDate || startDate, endTime || startTime);
      if (!end) {
        setFormError('Enter a valid end date and time.');
        return;
      }
      if (end < start) {
        setFormError('End must be after start.');
        return;
      }
      endIso = end.toISOString();
    }

    const ageNum = ageRestriction.trim() ? Number(ageRestriction) : undefined;
    if (ageNum !== undefined && (Number.isNaN(ageNum) || ageNum < 0 || ageNum > 99)) {
      setFormError('Age restriction must be between 0 and 99.');
      return;
    }

    setFormLoading(true);
    setFormError(null);
    try {
      const created = await createAdminEvent({
        name: name.trim(),
        description: description.trim() || undefined,
        eventDate: start.toISOString(),
        eventEndDate: endIso,
        venueName: venueName.trim(),
        city: city.trim(),
        country: country.trim() || undefined,
        latitude: latitude ?? undefined,
        longitude: longitude ?? undefined,
        category: category === 'Minimal' ? '' : category,
        ageRestriction: ageNum,
        tags: tags.trim() ? tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
        resaleEnabled,
        resalePriceCapBps:
          resaleEnabled && usePriceCap ? Math.round(resalePriceCapPercent * 100) : undefined,
        resaleRoyaltyBps:
          resaleEnabled && useResaleRoyalty ? Math.round(resaleRoyaltyPercent * 100) : undefined,
        zones: zones.trim() ? zones.split(',').map((z) => z.trim()).filter(Boolean) : undefined,
      });

      if (imageFile) {
        try {
          await uploadAdminEventBanner(created.id, {
            fileName: imageFile.name,
            mimeType: imageFile.type,
            contentBase64: await fileToBase64(imageFile),
          });
        } catch {
          // Event created; image can be uploaded later from event detail
        }
      }

      router.push(`/admin/events/${created.id}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Event creation failed');
    } finally {
      setFormLoading(false);
    }
  };

  return (
    <motion.form
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
      onSubmit={(e) => void handleCreate(e)}
      className="bg-paper border border-mist rounded-xl overflow-hidden"
      aria-labelledby="create-event-title"
    >
      <div className="px-4 sm:px-5 py-3 flex items-center justify-between gap-3 border-b border-mist">
        <h3 id="create-event-title" className="text-sm font-semibold text-ink">
          Create Event
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close create event form"
          className="text-silver hover:text-ink text-sm transition-colors px-2 py-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
        >
          ✕
        </button>
      </div>

      <div className="p-4 sm:p-5">
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-5 lg:gap-6">
          {/* Left — cover image & theme */}
          <div className="space-y-3">
            <div className="relative aspect-square max-w-[220px] mx-auto lg:mx-0 w-full rounded-2xl border border-mist bg-mist/25 overflow-hidden">
              {imagePreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imagePreview} alt="Event cover preview" className="w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-silver">
                  <ImagePlus className="w-8 h-8 opacity-40" />
                  <span className="text-[10px] font-mono uppercase tracking-wider">Cover image</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-3 right-3 w-9 h-9 rounded-full bg-paper border border-mist shadow-sm flex items-center justify-center text-ink hover:bg-mist/40 transition-colors"
                aria-label="Upload event image"
              >
                <ImagePlus className="w-4 h-4" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleImagePick(e.target.files?.[0] ?? null)}
              />
            </div>

            <div className="flex gap-2 max-w-[220px] mx-auto lg:mx-0 w-full">
              <div className="flex-1 min-w-0">
                <label htmlFor="event-theme" className={labelTiny}>
                  Theme
                </label>
                <select
                  id="event-theme"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className={`${inputLarge} py-2.5 text-sm mt-0.5`}
                >
                  {THEME_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={shuffleTheme}
                title="Random theme"
                className="self-end shrink-0 w-10 h-[42px] border border-mist rounded-lg flex items-center justify-center text-graphite hover:bg-mist/40 transition-colors"
              >
                <Shuffle className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Right — event fields */}
          <div className="space-y-2.5 min-w-0">
            <input
              id="event-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Event Name"
              className="w-full text-2xl sm:text-[1.75rem] font-semibold bg-transparent border-0 border-b border-mist pb-2 text-ink placeholder:text-silver/50 focus:outline-none focus:border-ink/40 focus:ring-0"
            />

            {/* Date & time + timezone */}
            <div className="rounded-xl border border-mist overflow-hidden">
              <div className="flex flex-col sm:flex-row">
                <div className="flex-1 divide-y divide-mist">
                  <div className="flex items-center gap-2 px-3 py-2">
                    <span className="text-xs text-graphite w-10 shrink-0">Start</span>
                    <label className="sr-only" htmlFor="event-start-date">
                      Start date
                    </label>
                    <input
                      id="event-start-date"
                      type="date"
                      required
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className={dateTimeInput}
                      title={formatDateLabel(startDate)}
                    />
                    <label className="sr-only" htmlFor="event-start-time">
                      Start time
                    </label>
                    <input
                      id="event-start-time"
                      type="time"
                      required
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className={dateTimeInput}
                      title={formatTimeLabel(startTime)}
                    />
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2">
                    <span className="text-xs text-graphite w-10 shrink-0">End</span>
                    <label className="sr-only" htmlFor="event-end-date">
                      End date
                    </label>
                    <input
                      id="event-end-date"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className={dateTimeInput}
                      title={formatDateLabel(endDate)}
                    />
                    <label className="sr-only" htmlFor="event-end-time">
                      End time
                    </label>
                    <input
                      id="event-end-time"
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className={dateTimeInput}
                      title={formatTimeLabel(endTime)}
                    />
                  </div>
                </div>
                <div className="sm:w-28 border-t sm:border-t-0 sm:border-l border-mist bg-mist/15 px-3 py-3 flex sm:flex-col items-center justify-center gap-1 text-center shrink-0">
                  <Globe className="w-4 h-4 text-silver" aria-hidden />
                  <span className="text-[11px] font-mono font-medium text-graphite">{timeZoneInfo.label}</span>
                  <span className="text-[10px] text-silver leading-tight">{timeZoneInfo.city}</span>
                </div>
              </div>
            </div>

            {/* Location */}
            <div className="rounded-xl border border-mist px-4 py-3 space-y-3">
              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-silver mt-1 shrink-0" aria-hidden />
                <div className="flex-1 space-y-2 min-w-0">
                  <input
                    id="event-venue"
                    type="text"
                    required
                    value={venueName}
                    onChange={(e) => setVenueName(e.target.value)}
                    placeholder="Add event location"
                    className="w-full text-base font-medium bg-transparent border-0 p-0 text-ink placeholder:text-silver/60 focus:outline-none focus:ring-0"
                  />
                  <input
                    id="event-city"
                    type="text"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="City — offline venue or virtual link"
                    className="w-full text-sm bg-transparent border-0 p-0 text-graphite placeholder:text-silver/50 focus:outline-none focus:ring-0"
                  />
                </div>
              </div>
              <LocationMapPicker
                latitude={latitude}
                longitude={longitude}
                onPick={(loc) => {
                  setVenueName(loc.venueName);
                  if (loc.city) setCity(loc.city);
                  setCountry(loc.country);
                  setLatitude(loc.latitude);
                  setLongitude(loc.longitude);
                }}
              />
            </div>

            {/* Description */}
            <div className="rounded-xl border border-mist px-4 py-3">
              <div className="flex items-start gap-3">
                <FileText className="w-4 h-4 text-silver mt-1 shrink-0" aria-hidden />
                <div className="flex-1 min-w-0">
                  <span className={labelTiny}>Description</span>
                  <textarea
                    id="event-description"
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Add description"
                    className="w-full mt-1 text-base bg-transparent border-0 p-0 text-ink placeholder:text-silver/50 resize-none focus:outline-none focus:ring-0 leading-relaxed"
                  />
                </div>
              </div>
            </div>

            {/* Event options */}
            <div>
              <p className={`${labelTiny} mb-1.5 px-0.5`}>Event options</p>
              <div className="rounded-xl border border-mist divide-y divide-mist overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Ticket className="w-4 h-4 text-silver shrink-0" />
                    <span className="text-sm text-ink">Ticket tiers</span>
                  </div>
                  <span className="text-sm text-graphite shrink-0">Add after create</span>
                </div>

                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <RefreshCw className="w-4 h-4 text-silver shrink-0" />
                    <span className="text-sm text-ink">Resale marketplace</span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={resaleEnabled}
                    onClick={() => {
                      const next = !resaleEnabled;
                      setResaleEnabled(next);
                      if (!next) {
                        setUsePriceCap(false);
                        setUseResaleRoyalty(false);
                      }
                    }}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 ${
                      resaleEnabled ? 'bg-ink' : 'bg-mist'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-paper transition-transform ${
                        resaleEnabled ? 'translate-x-4' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <AnimatePresence>
                  {resaleEnabled && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden divide-y divide-mist border-t border-mist"
                    >
                      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-mist/10">
                        <span className="text-sm text-graphite">Max resale price</span>
                        {editingResaleCap ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={100}
                              max={1000}
                              value={resalePriceCapPercent}
                              onChange={(e) => {
                                setUsePriceCap(true);
                                setResalePriceCapPercent(Number(e.target.value));
                              }}
                              className="w-20 px-2 py-1 text-sm border border-mist rounded font-mono"
                            />
                            <span className="text-xs text-silver">%</span>
                            <button
                              type="button"
                              onClick={() => setEditingResaleCap(false)}
                              className="text-xs text-ink font-medium"
                            >
                              Done
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setUsePriceCap(true);
                              setEditingResaleCap(true);
                            }}
                            className="flex items-center gap-1.5 text-sm text-graphite hover:text-ink"
                          >
                            {usePriceCap ? `${resalePriceCapPercent}%` : 'Default'}
                            <Pencil className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-mist/10">
                        <span className="text-sm text-graphite">Resale royalty</span>
                        {editingResaleRoyalty ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={0.1}
                              value={resaleRoyaltyPercent}
                              onChange={(e) => {
                                setUseResaleRoyalty(true);
                                setResaleRoyaltyPercent(Number(e.target.value));
                              }}
                              className="w-20 px-2 py-1 text-sm border border-mist rounded font-mono"
                            />
                            <span className="text-xs text-silver">%</span>
                            <button
                              type="button"
                              onClick={() => setEditingResaleRoyalty(false)}
                              className="text-xs text-ink font-medium"
                            >
                              Done
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setUseResaleRoyalty(true);
                              setEditingResaleRoyalty(true);
                            }}
                            className="flex items-center gap-1.5 text-sm text-graphite hover:text-ink"
                          >
                            {useResaleRoyalty ? `${resaleRoyaltyPercent}%` : 'Default'}
                            <Pencil className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  type="button"
                  onClick={() => setShowDetails(!showDetails)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-mist/20 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Users className="w-4 h-4 text-silver shrink-0" />
                    <span className="text-sm text-ink">More details</span>
                  </div>
                  <span className="text-xs text-silver">{showDetails ? 'Hide' : 'Show'}</span>
                </button>
              </div>
            </div>

            <AnimatePresence>
              {showDetails && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden space-y-2"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <label htmlFor="event-age" className={labelTiny}>
                        Age restriction
                      </label>
                      <input
                        id="event-age"
                        type="number"
                        min={0}
                        max={99}
                        value={ageRestriction}
                        onChange={(e) => setAgeRestriction(e.target.value)}
                        placeholder="All ages"
                        className={`${inputLarge} py-2.5 text-sm mt-0.5 font-mono`}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label htmlFor="event-tags" className={labelTiny}>
                        Tags
                      </label>
                      <input
                        id="event-tags"
                        type="text"
                        value={tags}
                        onChange={(e) => setTags(e.target.value)}
                        placeholder="live, outdoor, vip"
                        className={`${inputLarge} py-2.5 text-sm mt-0.5`}
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="event-zones" className={labelTiny}>
                      Access zones
                    </label>
                    <input
                      id="event-zones"
                      type="text"
                      value={zones}
                      onChange={(e) => setZones(e.target.value)}
                      placeholder="Gate A, VIP Lounge, Backstage"
                      className={`${inputLarge} py-2.5 text-sm mt-0.5`}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {formError && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-mist bg-mist/30 px-3 py-2.5"
              >
                <AlertCircle className="w-4 h-4 text-ink shrink-0 mt-0.5" />
                <span className="text-sm text-ink">{formError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={formLoading}
              className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 ${
                formLoading
                  ? 'bg-mist text-silver cursor-not-allowed'
                  : 'bg-ink text-paper hover:bg-charcoal'
              }`}
            >
              {formLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Creating…</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>Create Event</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </motion.form>
  );
}
