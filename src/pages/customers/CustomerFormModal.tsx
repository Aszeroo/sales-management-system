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
import { customerService } from '@/services/customer.service';
import { salesService } from '@/services/sales.service';
import { useAuth } from '@/contexts/AuthContext';
import Swal from 'sweetalert2';
import type { CustomerWithCounts, Sales } from '@/types';

interface CustomerFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  customer?: CustomerWithCounts | null;
}

export function CustomerFormModal({ isOpen, onClose, onSuccess, customer }: CustomerFormModalProps) {
  const { t } = useTranslation();
  const { isAdmin, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [salesList, setSalesList] = useState<Sales[]>([]);
  const [mySalesId, setMySalesId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin && user?.id) {
      salesService.getByUserId(user.id).then((s) => {
        if (s) setMySalesId(s.id);
      });
    }
  }, [isAdmin, user]);

  const customerSchema = z.object({
    customer_name: z.string().min(1, t('validation.required')),
    company_name: z.string().optional(),
    contact_person: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email(t('validation.invalidEmail')).optional().or(z.literal('')),
    address: z.string().optional(),
    description: z.string().optional(),
    sales_id: z.string().min(1, t('validation.required')),
    status: z.enum(['active', 'inactive']),
  });

  type CustomerFormData = z.infer<typeof customerSchema>;

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      status: 'active',
    },
  });

  useEffect(() => {
    if (isAdmin) {
      salesService.getAll().then(setSalesList);
    }
    if (customer) {
      reset({
        customer_name: customer.customer_name,
        company_name: customer.company_name,
        contact_person: customer.contact_person,
        phone: customer.phone,
        email: customer.email,
        address: customer.address,
        description: customer.description,
        sales_id: customer.sales_id,
        status: customer.status,
      });
    } else {
      reset({
        customer_name: '',
        company_name: '',
        contact_person: '',
        phone: '',
        email: '',
        address: '',
        description: '',
        sales_id: mySalesId || '',
        status: 'active',
      });
    }
  }, [customer, isAdmin, reset, mySalesId]);

  const onSubmit = async (data: CustomerFormData) => {
    setLoading(true);
    try {
      if (customer) {
        await customerService.update(customer.id, data);
      } else {
        // Generate customer code
        const allCustomers = await customerService.getAll();
        const nextNum = allCustomers.length + 1;
        const code = `C${String(nextNum).padStart(3, '0')}`;

        await customerService.create({
          customer_code: code,
          ...data,
          company_name: data.company_name || '',
          contact_person: data.contact_person || '',
          phone: data.phone || '',
          email: data.email || '',
          address: data.address || '',
          description: data.description || '',
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
      title={customer ? t('customerPage.editCustomer') : t('customerPage.addCustomer')}
      size="lg"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <TextInput
          label={t('customerPage.customerName') + ' *'}
          {...register('customer_name')}
          error={errors.customer_name?.message}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextInput
            label={t('customerPage.companyName')}
            {...register('company_name')}
          />
          <TextInput
            label={t('customerPage.contactPerson')}
            {...register('contact_person')}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextInput
            label={t('customerPage.phone')}
            {...register('phone')}
          />
          <TextInput
            label={t('customerPage.email')}
            type="email"
            {...register('email')}
            error={errors.email?.message}
          />
        </div>

        <TextInput
          label={t('common.address')}
          {...register('address')}
        />

        <Textarea
          label={t('common.description')}
          {...register('description')}
        />

        {isAdmin ? (
          <Select
            label={t('customerPage.salesOwner') + ' *'}
            {...register('sales_id')}
            error={errors.sales_id?.message}
            options={salesList.map((s) => ({
              value: s.id,
              label: `${s.sales_code} - ${s.full_name}`,
            }))}
            placeholder={t('customerPage.selectSales')}
          />
        ) : (
          <input type="hidden" {...register('sales_id')} />
        )}

        <Select
          label={t('common.status')}
          {...register('status')}
          options={[
            { value: 'active', label: t('common.active') },
            { value: 'inactive', label: t('common.inactive') },
          ]}
        />

        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={loading}>
            {customer ? t('customerPage.updateCustomer') : t('customerPage.createCustomer')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
