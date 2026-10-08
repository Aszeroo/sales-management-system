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
import { CUSTOMER_STATUSES, statusFormOptions } from '@/lib/status';
import { submitForm } from '@/components/shared/formSubmit';
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
  // The signed-in manager/sales user's own sales row — they are Owner-capable
  // (ADR-0001), so their own row pre-fills the read-only Sales Owner field on
  // create (the DB auto-assigns it as well, see migration 0003).
  const [mySales, setMySales] = useState<Sales | null>(null);

  useEffect(() => {
    if (!isAdmin && user?.id) {
      salesService.getCurrentUserSales().then(setMySales);
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
    // Sales Owner is required only on the Admin form (Admin assigns it).
    // For owner-capable users the hidden field carries their own sales row
    // when the client has it — and an owner-capable user with no sales row
    // in hand yet submits WITHOUT the value, which is legal: the submit
    // omits the field and the DB trigger auto-assigns it (issue #23).
    sales_id: isAdmin
      ? z.string().min(1, t('validation.required'))
      : z.string().optional(),
    status: z.enum(CUSTOMER_STATUSES),
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
        sales_id: mySales?.id || '',
        status: 'active',
      });
    }
  }, [customer, isAdmin, reset, mySales]);

  const onSubmit = async (data: CustomerFormData) => {
    await submitForm(
      t,
      async () => {
        if (customer) {
          await customerService.update(customer.id, data);
        } else {
          // Generate customer code
          const allCustomers = await customerService.getAll();
          const nextNum = allCustomers.length + 1;
          const code = `C${String(nextNum).padStart(3, '0')}`;

          // Never send an empty-string Sales Owner: '' into a uuid column is
          // a DB cast error. An owner-capable user whose own sales row is not
          // in hand submits WITHOUT the field and the trigger auto-assigns
          // the owner (issue #23); an Admin always has one picked here.
          const { sales_id, ...fields } = data;
          await customerService.create({
            customer_code: code,
            ...fields,
            ...(sales_id ? { sales_id } : {}),
            company_name: data.company_name || '',
            contact_person: data.contact_person || '',
            phone: data.phone || '',
            email: data.email || '',
            address: data.address || '',
            description: data.description || '',
          });
        }
      },
      { setLoading, onSuccess },
    );
  };

  // Read-only Sales Owner display: on create it is the signed-in
  // owner-capable user (they become the owner), on edit it is the customer's
  // current owner from the joined sales row. Assigning/moving the Sales
  // Owner is Admin-only (Permission Matrix), so this field is never
  // editable for manager/sales.
  const displayOwner = customer ? customer.sales || null : mySales;
  const ownerLabel = displayOwner
    ? `${displayOwner.sales_code} - ${displayOwner.full_name}`
    : '';

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
          <div>
            <TextInput
              label={t('customerPage.salesOwner') + ' *'}
              value={ownerLabel}
              readOnly
              disabled
            />
            <p className="mt-1 text-xs text-gray-500">
              {t('customerPage.ownerReadOnlyHint')}
            </p>
            <input type="hidden" {...register('sales_id')} />
          </div>
        )}

        <Select
          label={t('common.status')}
          {...register('status')}
          options={statusFormOptions(CUSTOMER_STATUSES, t)}
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
