export interface DesktopWidget {
  id: string;
  title: string;
  type: 'status' | 'commands' | 'approvals' | 'workflows';
  refreshSeconds: number;
}

export const DEFAULT_DESKTOP_WIDGETS: DesktopWidget[] = [
  { id: 'status', title: 'System Status', type: 'status', refreshSeconds: 15 },
  { id: 'commands', title: 'Command Catalog', type: 'commands', refreshSeconds: 60 },
  { id: 'approvals', title: 'Pending Approvals', type: 'approvals', refreshSeconds: 20 },
  { id: 'workflows', title: 'Workflows', type: 'workflows', refreshSeconds: 30 },
];
