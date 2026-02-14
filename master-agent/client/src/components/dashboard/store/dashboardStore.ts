import { create } from 'zustand';
import type { TemplateDto } from '../../../services/templatesClient';
import type { Task as DashboardTask, Agent as DashboardAgent, WidgetZones, Suggestion } from '../types';

export const profileFormInitial = {
  name: 'master-agent',
  displayName: 'Master Agent',
  persona: 'Orchestrator focused on clarity, brevity, and actionable steps.',
  traitTone: 'concise',
  traitRisk: 'cautious',
  traitDomain: 'general',
  defaultPlannerModel: 'codellama:7b-instruct-q4_0',
  fallbackPlannerModel: 'gemma3:1b',
  defaultCoderModel: 'qwen2.5-coder:14b',
  fallbackCoderModel: 'codellama:instruct',
  ragEnabled: true,
  ragKDefault: 6,
  plannerTimeoutMs: 480000,
  retries: 0,
  delegateIntervalMs: 60000,
  autoDelegateEnabled: true,
  loggingLevel: 'info'
};

interface DashboardState {
  tasks: DashboardTask[];
  setTasks: (tasks: DashboardTask[]) => void;
  agents: DashboardAgent[];
  setAgents: (agents: DashboardAgent[]) => void;
  suggestions: Suggestion[];
  setSuggestions: (suggestions: Suggestion[]) => void;
  templates: TemplateDto[];
  setTemplates: (templates: TemplateDto[]) => void;
  selectedTemplateId: string;
  setSelectedTemplateId: (id: string) => void;
  templateInputs: Record<string, string>;
  setTemplateInputs: (next: Record<string, string>) => void;
  templateForm: {
    title: string;
    description: string;
    category: string;
    agents: string;
    inputs: string;
    steps: string;
  };
  setTemplateForm: (
    updater:
      | DashboardState['templateForm']
      | ((prev: DashboardState['templateForm']) => DashboardState['templateForm'])
  ) => void;
  widgetZones: WidgetZones;
  setWidgetZones: (updater: WidgetZones | ((prev: WidgetZones) => WidgetZones)) => void;
  profileForm: typeof profileFormInitial;
  setProfileForm: (
    updater: typeof profileFormInitial | ((prev: typeof profileFormInitial) => typeof profileFormInitial)
  ) => void;
}

type SetState = (
  partial:
    | DashboardState
    | Partial<DashboardState>
    | ((state: DashboardState) => DashboardState | Partial<DashboardState>),
  replace?: boolean
) => void;

export const useDashboardStore = create<DashboardState>((set: SetState) => ({
  tasks: [],
  setTasks: (tasks: DashboardTask[]) => set({ tasks }),
  agents: [],
  setAgents: (agents: DashboardAgent[]) => set({ agents }),
  suggestions: [],
  setSuggestions: (suggestions: Suggestion[]) => set({ suggestions }),
  templates: [],
  setTemplates: (templates: TemplateDto[]) => set({ templates }),
  selectedTemplateId: '',
  setSelectedTemplateId: (id: string) => set({ selectedTemplateId: id }),
  templateInputs: {},
  setTemplateInputs: (next: Record<string, string>) => set({ templateInputs: next }),
  templateForm: {
    title: '',
    description: '',
    category: 'custom',
    agents: 'email-agent',
    inputs: '',
    steps: ''
  },
  setTemplateForm: (
    updater:
      | DashboardState['templateForm']
      | ((prev: DashboardState['templateForm']) => DashboardState['templateForm'])
  ) =>
    set((state) => ({
      templateForm: typeof updater === 'function' ? updater(state.templateForm) : { ...state.templateForm, ...updater }
    })),
  widgetZones: { header: ['newTask', 'registerAgent'], main: ['tasks', 'templates', 'suggestions'], secondary: ['agents'], footer: ['chat', 'result', 'delegation', 'settings'] },
  setWidgetZones: (updater: WidgetZones | ((prev: WidgetZones) => WidgetZones)) =>
    set((state) => ({
      widgetZones: typeof updater === 'function' ? updater(state.widgetZones) : updater
    })),
  profileForm: profileFormInitial,
  setProfileForm: (
    updater: typeof profileFormInitial | ((prev: typeof profileFormInitial) => typeof profileFormInitial)
  ) =>
    set((state) => ({
      profileForm: typeof updater === 'function' ? updater(state.profileForm) : { ...state.profileForm, ...updater }
    }))
}));
