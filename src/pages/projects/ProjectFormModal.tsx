import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/TextInput';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { projectService } from '@/services/project.service';
import { customerService } from '@/services/customer.service';
import Swal from 'sweetalert2';
import type { ProjectWithCustomer, Customer } from '@/types';

interface ProjectFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  project?: ProjectWithCustomer | null;
}

export function ProjectFormModal({ isOpen, onClose, onSuccess, project }: ProjectFormModalProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const projectSchema = z.object({
    project_name: z.string().min(1, t('validation.required')),
    customer_id: z.string().min(1, t('validation.required')),
    description: z.string().optional(),
    budget: z.coerce.number().min(0, t('validation.invalidBudget')),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    status: z.enum(['planning', 'in_progress', 'completed', 'cancelled']),
  });

  type ProjectFormData = z.infer<typeof projectSchema>;

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      status: 'planning',
      budget: 0,
    },
  });

  useEffect(() => {
    customerService.getAll().then((data) => setCustomers(data.filter((c) => c.status === 'active')));

    if (project) {
      reset({
        project_name: project.project_name,
        customer_id: project.customer_id,
        description: project.description,
        budget: project.budget,
        start_date: project.start_date || '',
        end_date: project.end_date || '',
        status: project.status,
      });
    } else {
      reset({
        project_name: '',
        customer_id: '',
        description: '',
        budget: 0,
        start_date: '',
        end_date: '',
        status: 'planning',
      });
    }
  }, [project, reset]);

  const onSubmit = async (data: ProjectFormData) => {
    setLoading(true);
    try {
      if (project) {
        await projectService.update(project.id, {
          ...data,
          start_date: data.start_date || null,
          end_date: data.end_date || null,
        });
      } else {
        const allProjects = await projectService.getAll();
        const nextNum = allProjects.length + 1;
        const code = `P${String(nextNum).padStart(3, '0')}`;

        await projectService.create({
          project_code: code,
          ...data,
          description: data.description || '',
          start_date: data.start_date || null,
          end_date: data.end_date || null,
        });
      }
      Swal.fire(t('common.success'), '', 'success');
      onSuccess();
    } catch {
      Swal.fire(t('common.error'), '', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={project ? t('projectPage.editProject') : t('projectPage.addProject')}
      size="lg"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <TextInput
          label={t('projectPage.projectName') + ' *'}
          {...register('project_name')}
          error={errors.project_name?.message}
        />

        <Select
          label={t('projectPage.customer') + ' *'}
          {...register('customer_id')}
          error={errors.customer_id?.message}
          options={customers.map((c) => ({
            value: c.id,
            label: `${c.customer_code} - ${c.customer_name}`,
          }))}
          placeholder={t('projectPage.selectCustomer')}
        />

        <Textarea
          label={t('common.description')}
          {...register('description')}
        />

        <TextInput
          label={t('projectPage.budget')}
          type="number"
          step="0.01"
          {...register('budget')}
          error={errors.budget?.message}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextInput
            label={t('projectPage.startDate')}
            type="date"
            {...register('start_date')}
          />
          <TextInput
            label={t('projectPage.endDate')}
            type="date"
            {...register('end_date')}
          />
        </div>

        <Select
          label={t('common.status')}
          {...register('status')}
          options={[
            { value: 'planning', label: t('projectPage.planning') },
            { value: 'in_progress', label: t('projectPage.inProgress') },
            { value: 'completed', label: t('projectPage.completed') },
            { value: 'cancelled', label: t('projectPage.cancelled') },
          ]}
        />

        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={loading}>
            {project ? t('projectPage.updateProject') : t('projectPage.createProject')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
