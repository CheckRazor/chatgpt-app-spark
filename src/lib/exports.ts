// Export utilities for Discord and CSV formats

export interface PlayerBalance {
  player_name: string;
  gold: number;
  silver: number;
  bronze: number;
  total_value: number;
}

export interface LeaderboardEntry {
  rank: number;
  player_name: string;
  score: number;
  event_name?: string;
}

// Discord export formatting
export const formatDiscordLeaderboard = (
  entries: LeaderboardEntry[],
  title: string = "Leaderboard"
): string => {
  let discord = `**${title}**\n\`\`\`\n`;
  discord += `Rank | Player Name                | Score\n`;
  discord += `-----|----------------------------|----------\n`;
  
  entries.forEach(entry => {
    const rank = entry.rank.toString().padEnd(4);
    const name = entry.player_name.slice(0, 26).padEnd(26);
    const score = entry.score.toString().padStart(10);
    discord += `${rank} | ${name} | ${score}\n`;
  });
  
  discord += `\`\`\``;
  return discord;
};

export const formatDiscordBalances = (
  balances: PlayerBalance[],
  title: string = "Medal Balances"
): string => {
  let discord = `**${title}**\n\`\`\`\n`;
  discord += `Player Name                | Gold | Silver | Bronze | Total Value\n`;
  discord += `---------------------------|------|--------|--------|------------\n`;
  
  balances.forEach(balance => {
    const name = balance.player_name.slice(0, 26).padEnd(26);
    const gold = balance.gold.toString().padStart(4);
    const silver = balance.silver.toString().padStart(6);
    const bronze = balance.bronze.toString().padStart(6);
    const total = balance.total_value.toString().padStart(11);
    discord += `${name} | ${gold} | ${silver} | ${bronze} | ${total}\n`;
  });
  
  discord += `\`\`\``;
  return discord;
};

export const formatDiscordEventSummary = (
  eventName: string,
  eventDate: string,
  topScores: LeaderboardEntry[],
  medalTotals?: { gold: number; silver: number; bronze: number }
): string => {
  let discord = `**${eventName}** - ${new Date(eventDate).toLocaleDateString()}\n\n`;
  
  if (medalTotals) {
    discord += `**Medal Distribution:**\n`;
    discord += `🥇 Gold: ${medalTotals.gold} | 🥈 Silver: ${medalTotals.silver} | 🥉 Bronze: ${medalTotals.bronze}\n\n`;
  }
  
  discord += formatDiscordLeaderboard(topScores.slice(0, 10), "Top 10 Scores");
  
  return discord;
};

// CSV export functions
export const generateCSV = (data: any[], headers: string[]): string => {
  const csvRows = [];
  
  // Add headers
  csvRows.push(headers.join(','));
  
  // Add data rows
  data.forEach(row => {
    const values = headers.map(header => {
      const value = row[header];
      // Escape values containing commas or quotes
      if (value === null || value === undefined) return '';
      const escaped = value.toString().replace(/"/g, '""');
      return escaped.includes(',') || escaped.includes('"') ? `"${escaped}"` : escaped;
    });
    csvRows.push(values.join(','));
  });
  
  return csvRows.join('\n');
};

export const downloadCSV = (csvContent: string, filename: string): void => {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const exportPlayersCSV = (players: any[]): void => {
  const data = players.map(p => ({
    canonical_name: p.canonical_name,
    aliases: p.aliases?.join('; ') || '',
    status: p.status,
    is_alt: p.is_alt ? 'Yes' : 'No',
    joined_at: new Date(p.joined_at).toLocaleDateString(),
  }));
  
  const csv = generateCSV(data, ['canonical_name', 'aliases', 'status', 'is_alt', 'joined_at']);
  downloadCSV(csv, `players-${new Date().toISOString().split('T')[0]}.csv`);
};

export const exportScoresCSV = (scores: any[], eventName: string): void => {
  const data = scores.map(s => ({
    rank: s.rank || '',
    player_name: s.players?.canonical_name || '',
    score: s.score,
    verified: s.verified ? 'Yes' : 'No',
    notes: s.notes || '',
  }));
  
  const csv = generateCSV(data, ['rank', 'player_name', 'score', 'verified', 'notes']);
  const filename = `scores-${eventName.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`;
  downloadCSV(csv, filename);
};

export const exportLedgerCSV = (transactions: any[], eventName?: string): void => {
  const data = transactions.map(t => ({
    date: new Date(t.created_at).toLocaleString(),
    player_name: t.players?.canonical_name || '',
    transaction_type: t.transaction_type,
    medal: t.medals?.name || '',
    amount: t.amount,
    event: t.events?.name || '',
    raffle: t.raffles?.name || '',
    description: t.description || '',
  }));
  
  const csv = generateCSV(data, ['date', 'player_name', 'transaction_type', 'medal', 'amount', 'event', 'raffle', 'description']);
  const filename = eventName 
    ? `ledger-${eventName.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`
    : `ledger-full-${new Date().toISOString().split('T')[0]}.csv`;
  downloadCSV(csv, filename);
};

export const exportBalancesCSV = (balances: PlayerBalance[]): void => {
  const csv = generateCSV(balances, ['player_name', 'gold', 'silver', 'bronze', 'total_value']);
  downloadCSV(csv, `balances-${new Date().toISOString().split('T')[0]}.csv`);
};

// Copy to clipboard helper
export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy:', err);
    return false;
  }
};
