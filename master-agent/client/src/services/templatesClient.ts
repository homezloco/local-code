import axios from 'axios';

export type TemplateDto = {
  id: string;
  title: string;
  description: string;
  category: string;
  agents: string[];
  inputs: string[];
  steps: string[];
  isCustom?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export async function fetchTemplates(): Promise<TemplateDto[]> {
  const resp = await axios.get('http://localhost:3001/workflows');
  return (resp.data?.workflows as TemplateDto[]) || [];
}

export async function createTemplate(template: Omit<TemplateDto, 'id' | 'createdAt' | 'updatedAt' | 'isCustom'>) {
  const resp = await axios.post('http://localhost:3001/workflows', template);
  return resp.data as TemplateDto;
}

export async function updateTemplate(id: string, template: Omit<TemplateDto, 'id' | 'createdAt' | 'updatedAt' | 'isCustom'>) {
  const resp = await axios.put(`http://localhost:3001/workflows/${id}`, template);
  return resp.data as TemplateDto;
}

export async function deleteTemplate(id: string) {
  await axios.delete(`http://localhost:3001/workflows/${id}`);
}
