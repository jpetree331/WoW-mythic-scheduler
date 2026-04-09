import React, { useState, useEffect, useMemo } from 'react';
import { Player, Match, Role } from './types';
import AvailabilityForm from './components/AvailabilityForm';
import SummaryDisplay from './components/SummaryDisplay';
import { findOverlaps, isFullGroup } from './services/matchingService';
import { fetchPlayers, createPlayer, deletePlayer as apiDeletePlayer, clearPlayers as apiClearPlayers, setAdminToken, subscribeToUpdates, getAdminToken, clearAdminToken, updatePlayer as apiUpdatePlayer, getClientId } from './services/api';

// Admin UI visibility: only the project owner's browser (by clientId) sees the Set Admin Token button.
const ADMIN_CLIENT_ID = (import.meta as any).env?.VITE_ADMIN_CLIENT_ID as string | undefined;


const App: React.FC = () => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [roleFilters, setRoleFilters] = useState<Set<Role>>(new Set());
  const [sortOption, setSortOption] = useState<'groupSize' | 'time' | 'fullGroups'>('groupSize');
  const [isAdmin, setIsAdmin] = useState<boolean>(!!getAdminToken());
  const [editing, setEditing] = useState<Player | null>(null);
  const [timezoneFilter, setTimezoneFilter] = useState<string>('all');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const myClientId = getClientId();
  const isOwner = ADMIN_CLIENT_ID ? myClientId === ADMIN_CLIENT_ID : false;

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(null), 5000);
  };

  const showStatus = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 2500);
  };

  useEffect(() => {
    const calculatedMatches = findOverlaps(players);
    setMatches(calculatedMatches);
  }, [players]);

  // Initial load from backend
  useEffect(() => {
    (async () => {
      try {
        const data = await fetchPlayers();
        setPlayers(data);
      } catch (e) {
        console.error('Failed to load players', e);
      }
    })();
    setIsAdmin(!!getAdminToken());
    // Subscribe to live updates
    const unsubscribe = subscribeToUpdates(async () => {
      try {
        const data = await fetchPlayers();
        setPlayers(data);
      } catch (e) {
        console.error('Failed to refresh players after update', e);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleAddPlayer = async (playerData: Omit<Player, 'id'>) => {
    try {
      if (editing) {
        const updated = await apiUpdatePlayer(editing.id, playerData);
        // Preserve clientId and board from existing player to avoid losing ownership in UI state
        setPlayers(prev => prev.map(p => p.id === editing.id ? { ...p, ...updated } as Player : p));
        setEditing(null);
      } else {
        const created = await createPlayer(playerData);
        setPlayers(prev => [...prev, created]);
      }
    } catch (e) {
      console.error('Failed to add player', e);
      showError('Failed to submit availability. Please try again.');
    }
  };
  
  const handleDeletePlayer = async (playerId: string) => {
    try {
      await apiDeletePlayer(playerId);
      setPlayers(prevPlayers => prevPlayers.filter(p => p.id !== playerId));
    } catch (e) {
      console.error('Failed to delete player', e);
      if (!getAdminToken()) {
        const token = prompt('Admin token required to delete. Enter token:');
        if (token) setAdminToken(token);
      } else {
        showError('Failed to delete player.');
      }
    }
  };
  
  const handleClearAllPlayers = async () => {
    if (!confirm('This will remove ALL players from the shared list. Continue?')) return;
    try {
      await apiClearPlayers();
      setPlayers([]);
    } catch (e) {
      console.error('Failed to clear players', e);
      const token = prompt('Admin token required to clear all. Enter token:');
      if (token) {
        setAdminToken(token);
        try {
          await apiClearPlayers();
          setPlayers([]);
        } catch {
          showError('Failed to clear players.');
        }
      }
    }
  };

  // removed sample loader in production

  const toggleRoleFilter = (role: Role) => {
    setRoleFilters(prev => {
      const newFilters = new Set(prev);
      if (newFilters.has(role)) {
        newFilters.delete(role);
      } else {
        newFilters.add(role);
      }
      return newFilters;
    });
  };

  const sortedMatches = useMemo(() => {
    const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    return [...matches].sort((a, b) => {
      if (sortOption === 'fullGroups') {
        const aIsFull = isFullGroup(a);
        const bIsFull = isFullGroup(b);
        if (aIsFull !== bIsFull) return aIsFull ? -1 : 1;
      }
      
      if (sortOption === 'groupSize' || sortOption === 'fullGroups') {
         if (b.players.length !== a.players.length) {
            return b.players.length - a.players.length;
         }
      }

      if (dayOrder.indexOf(a.day) !== dayOrder.indexOf(b.day)) {
        return dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day);
      }
      return a.start - b.start;
    });
  }, [matches, sortOption]);

  const filteredMatches = useMemo(() => {
    if (roleFilters.size === 0) {
      let res = sortedMatches;
      if (timezoneFilter !== 'all') {
        res = res.filter(match => match.players.some(p => p.timezone === timezoneFilter));
      }
      return res;
    }
    let res = sortedMatches.filter(match => 
      Array.from(roleFilters).every(filterRole => 
        match.players.some(player => (player.roles||[]).includes(filterRole))
      )
    );
    if (timezoneFilter !== 'all') {
      res = res.filter(match => match.players.some(p => p.timezone === timezoneFilter));
    }
    return res;
  }, [sortedMatches, roleFilters, timezoneFilter]);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {errorMessage && (
          <div className="mb-4 px-4 py-3 bg-red-900 border border-red-600 text-red-200 rounded-md flex items-center justify-between">
            <span>{errorMessage}</span>
            <button onClick={() => setErrorMessage(null)} className="ml-4 text-red-400 hover:text-red-200 font-bold">✕</button>
          </div>
        )}
        {statusMessage && (
          <div className="mb-4 px-4 py-3 bg-gray-700 border border-gray-500 text-gray-200 rounded-md text-center">
            {statusMessage}
          </div>
        )}
        <header className="text-center mb-10">
          <h1 className="text-4xl sm:text-5xl font-bold text-yellow-400 tracking-wider" style={{textShadow: '0 0 10px rgba(250, 204, 21, 0.5)'}}>
            Mythic+ Friend Finder
          </h1>
          <p className="mt-2 text-lg text-gray-400">Coordinate your weekly keys with ease.</p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <button
              onClick={() => {
                const url = new URL(window.location.href);
                if (!url.searchParams.get('board')) {
                  url.searchParams.set('board', 'default');
                }
                navigator.clipboard.writeText(url.toString());
                showStatus('Link copied to clipboard');
              }}
              className="text-sm bg-gray-700 hover:bg-gray-600 text-yellow-300 font-semibold py-1 px-3 rounded-md transition-colors"
            >
              Copy Share Link
            </button>
            {isOwner && (
              <button
                onClick={() => {
                  const token = prompt('Set admin token (saved locally)');
                  if (token) { setAdminToken(token); setIsAdmin(true); }
                }}
                className="text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 font-semibold py-1 px-3 rounded-md transition-colors"
              >
                Set Admin Token
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => { clearAdminToken(); setIsAdmin(false); }}
                className="text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 font-semibold py-1 px-3 rounded-md transition-colors"
              >
                Clear Admin Token
              </button>
            )}
          </div>
        </header>
        
        <main className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <AvailabilityForm onSubmit={handleAddPlayer} initial={editing ? { ...editing } : undefined} onCancelEdit={() => setEditing(null)} />
          </div>
          <div className="lg:col-span-2">
            <SummaryDisplay 
              matches={filteredMatches} 
              allPlayers={players} 
              onDeletePlayer={handleDeletePlayer}
              onClearAllPlayers={handleClearAllPlayers}
              roleFilters={roleFilters}
              toggleRoleFilter={toggleRoleFilter}
              sortOption={sortOption}
              setSortOption={setSortOption}
              showAdminControls={isAdmin}
              myClientId={myClientId}
              onEditPlayer={(p)=> setEditing(p)}
              timezoneFilter={timezoneFilter}
              setTimezoneFilter={setTimezoneFilter}
            />
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
