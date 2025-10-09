import React, { useState } from 'react';
import { Player, Role, Availability, TimeSlot } from '../types';
import { DAYS_OF_WEEK, ROLES, TIME_OPTIONS, US_TIMEZONES } from '../constants';
import RoleSelector from './RoleSelector';

interface AvailabilityFormProps {
  onSubmit: (playerData: Omit<Player, 'id'>) => void;
  initial?: Omit<Player, 'id'> & { id?: string };
  onCancelEdit?: () => void;
}

const AvailabilityForm: React.FC<AvailabilityFormProps> = ({ onSubmit, initial, onCancelEdit }) => {
  const [name, setName] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<Role[]>([]);
  const [availability, setAvailability] = useState<Availability>({});
  const [notes, setNotes] = useState('');
  const [discordName, setDiscordName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const defaultTz = (Intl && Intl.DateTimeFormat().resolvedOptions().timeZone) || 'America/New_York';
  const [timezone, setTimezone] = useState<string>(defaultTz);

  // Load initial data if editing
  React.useEffect(() => {
    if (initial) {
      setName(initial.name || '');
      setSelectedRoles(initial.roles || []);
      setAvailability(initial.availability || {} as Availability);
      setNotes(initial.notes || '');
      setTimezone(initial.timezone || defaultTz);
      setDiscordName(initial.discordName || '');
    }
  }, [initial]);

  const handleAddTimeSlot = (day: string) => {
    const newSlot: TimeSlot = { start: 1140, end: 1260 }; // Default to 7:00 PM - 9:00 PM
    const daySlots = availability[day] ? [...availability[day], newSlot] : [newSlot];
    setAvailability({ ...availability, [day]: daySlots });
  };

  const handleRemoveTimeSlot = (day: string, index: number) => {
    const daySlots = [...(availability[day] || [])];
    daySlots.splice(index, 1);
    setAvailability({ ...availability, [day]: daySlots });
  };

  const handleTimeChange = (day: string, index: number, type: 'start' | 'end', value: number) => {
    const daySlots = [...(availability[day] || [])];
    const slot = { ...daySlots[index] };
    slot[type] = value;
    
    if (type === 'end' && slot.start >= value) {
        slot.end = slot.start + 30;
    }
     if (type === 'start' && value >= slot.end) {
        slot.start = slot.end - 30;
    }

    daySlots[index] = slot;
    setAvailability({ ...availability, [day]: daySlots });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
        setError('Please enter your character name.');
        return;
    }
    if (!selectedRoles || selectedRoles.length === 0) {
        setError('Please select at least one role.');
        return;
    }
    if (Object.keys(availability).length === 0 || Object.values(availability).every(v => v.length === 0)) {
        setError('Please add at least one time slot.');
        return;
    }
    setError(null);

    onSubmit({ name, roles: selectedRoles, availability, notes, timezone, discordName: discordName || undefined });
    setName('');
    setSelectedRoles([]);
    setAvailability({});
    setNotes('');
    setTimezone(defaultTz);
    setDiscordName('');
  };

  return (
    <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
      <h2 className="text-2xl font-bold mb-4 text-yellow-300">Add Your Availability</h2>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-1">Character Name</label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-gray-900 border border-gray-600 rounded-md py-2 px-3 text-white focus:ring-yellow-500 focus:border-yellow-500"
            placeholder="e.g., Arthas"
          />
        </div>
        
        <div>
           <label className="block text-sm font-medium text-gray-300 mb-2">Role(s) You Can Play</label>
           <RoleSelector selectedRoles={selectedRoles} onToggleRole={(role)=>{
              setSelectedRoles(prev => prev.includes(role) ? prev.filter(r=>r!==role) : [...prev, role]);
           }} />
        </div>

        <div>
          <label htmlFor="timezone" className="block text-sm font-medium text-gray-300 mb-1">Your Timezone</label>
          <select
            id="timezone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full bg-gray-900 border border-gray-600 rounded-md py-2 px-3 text-white focus:ring-yellow-500 focus:border-yellow-500"
          >
            {US_TIMEZONES.map(z => (
              <option key={z.id} value={z.id}>{z.label} — {z.id}</option>
            ))}
            {!US_TIMEZONES.find(z=>z.id===timezone) && (
              <option value={timezone}>{timezone}</option>
            )}
          </select>
        </div>

        <div>
          <label htmlFor="discord" className="block text-sm font-medium text-gray-300 mb-1">Discord Name (optional)</label>
          <input
            type="text"
            id="discord"
            value={discordName}
            onChange={(e) => setDiscordName(e.target.value)}
            className="w-full bg-gray-900 border border-gray-600 rounded-md py-2 px-3 text-white focus:ring-yellow-500 focus:border-yellow-500"
            placeholder="e.g., YourName#1234 or @yourname"
          />
        </div>

        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-gray-300 mb-1">Notes (Optional)</label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full bg-gray-900 border border-gray-600 rounded-md py-2 px-3 text-white focus:ring-yellow-500 focus:border-yellow-500"
            placeholder="e.g., 483 Devastation Evoker, ilvl 483, KSH 2200, prefer keys 8-12"
            rows={2}
          />
        </div>

        <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Weekly Availability (in your timezone)</label>
            <div className="space-y-4">
                {DAYS_OF_WEEK.map(day => (
                    <div key={day}>
                        <div className="flex justify-between items-center">
                             <h3 className="font-semibold text-gray-200">{day}</h3>
                             <button type="button" onClick={() => handleAddTimeSlot(day)} className="text-sm bg-blue-600 hover:bg-blue-700 text-white font-semibold py-1 px-3 rounded-md transition-colors">
                                + Add Slot
                            </button>
                        </div>
                        {availability[day] && availability[day].map((slot, index) => (
                           <div key={index} className="mt-2 p-3 bg-gray-700/50 rounded-md flex items-center space-x-2">
                                <select value={slot.start} onChange={(e) => handleTimeChange(day, index, 'start', parseInt(e.target.value))} className="w-full bg-gray-900 border border-gray-600 rounded-md py-1 px-2 text-white text-sm">
                                    {TIME_OPTIONS.map(opt => <option key={`start-${opt.value}`} value={opt.value}>{opt.label}</option>)}
                                </select>
                                <span className="text-gray-400">-</span>
                                <select value={slot.end} onChange={(e) => handleTimeChange(day, index, 'end', parseInt(e.target.value))} className="w-full bg-gray-900 border border-gray-600 rounded-md py-1 px-2 text-white text-sm">
                                    {TIME_OPTIONS.map(opt => <option key={`end-${opt.value}`} value={opt.value}>{opt.label}</option>)}
                                </select>
                                <button type="button" onClick={() => handleRemoveTimeSlot(day, index)} className="text-red-400 hover:text-red-300 font-bold text-xl">&times;</button>
                           </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex gap-3">
          <button type="submit" className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-bold py-3 px-4 rounded-md transition-colors text-lg">
            {initial ? 'Update Availability' : 'Submit Availability'}
          </button>
          {initial && onCancelEdit && (
            <button type="button" onClick={onCancelEdit} className="px-4 py-3 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-200 font-semibold">Cancel</button>
          )}
        </div>
      </form>
    </div>
  );
};

export default AvailabilityForm;
