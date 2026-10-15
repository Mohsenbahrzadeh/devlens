import type { ComponentType } from 'react';
import type { IconName } from '@/components/Icon';
import { JsonDiff } from '@/features/diff/components/JsonDiff';
import { Tools } from '@/features/encoding/components/Tools';
import { HttpTools } from '@/features/http/components/HttpTools';
import { JwtDecoder } from '@/features/jwt/components/JwtDecoder';
import { JsonViewer } from '@/features/json/components/JsonViewer';
import { Sender } from '@/features/sender/components/Sender';
import type { ToolProps } from './seed';

export interface Route {
  id: string;
  label: string;
  icon: IconName;
  component: ComponentType<ToolProps>;
  /** Use the full width (e.g. the network inspector) instead of the centred column. */
  wide?: boolean;
  /** Stay mounted (hidden) while another tab is active, so captured state is not lost. */
  keepAlive?: boolean;
}

/** Add a new tool by appending an entry here. Each module is independent. */
export const routes: Route[] = [
  { id: 'jwt', label: 'JWT', icon: 'key', component: JwtDecoder },
  { id: 'json', label: 'JSON', icon: 'code', component: JsonViewer },
  { id: 'diff', label: 'Diff', icon: 'diff', component: JsonDiff },
  { id: 'http', label: 'HTTP', icon: 'send', component: HttpTools },
  { id: 'tools', label: 'Tools', icon: 'tool', component: Tools },
  { id: 'sender', label: 'Sender', icon: 'shield', component: Sender },
];
