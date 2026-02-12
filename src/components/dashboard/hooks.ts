import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import type { Agent, Task } from './types';

export function useDashboardData() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchDashboardData = async () => {
    try {
      const [tasksResponse, agentsResponse] = await Promise.all([
        axios.get('http://localhost:3001/tasks'),
        axios.get('http://localhost:3001/agents')
      ]);

      setTasks(tasksResponse.data);
      setAgents(agentsResponse.data);
      setLoading(false);
    } catch (err) {
      setError('Failed to fetch dashboard data');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  return { tasks, agents, loading, error, fetchDashboardData };
}

export function useScrollZones() {
  const [activeZone, setActiveZone] = useState<'header' | 'main' | 'secondary' | 'footer'>('header');
  const zoneRefs: Record<'header' | 'main' | 'secondary' | 'footer', React.RefObject<HTMLDivElement | null>> = {
    header: useRef<HTMLDivElement | null>(null),
    main: useRef<HTMLDivElement | null>(null),
    secondary: useRef<HTMLDivElement | null>(null),
    footer: useRef<HTMLDivElement | null>(null)
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => (b.intersectionRatio || 0) - (a.intersectionRatio || 0));
        if (visible[0]?.target?.id && ['header', 'main', 'secondary', 'footer'].includes(visible[0].target.id)) {
          setActiveZone(visible[0].target.id as typeof activeZone);
        }
      },
      { threshold: [0.2, 0.4, 0.6] }
    );

    (Object.keys(zoneRefs) as (keyof typeof zoneRefs)[]).forEach((key) => {
      const el = zoneRefs[key].current;
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return { activeZone, zoneRefs };
}
