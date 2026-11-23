import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { useAppForm } from "@/components/patterns/app-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createProductMutationOptions } from "@/lib/api/gen/queries/useCreateProduct";
import { listProductsQueryKey } from "@/lib/api/gen/queries/useListProducts";
import { problemMessage } from "@/lib/api/problem";

import { catalogProblemMessages } from "../api/catalog";
import { createProductFormSchema } from "../schemas/create-product";

const productCreatedMsg = msg`Produto cadastrado com sucesso.`;
const namePlaceholderMsg = msg`Teclado mecânico`;

export function CreateProductDialog() {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const createMutation = useMutation({
    ...createProductMutationOptions(),
  });

  const schema = createProductFormSchema();

  const form = useAppForm({
    defaultValues: {
      sku: "",
      name: "",
      price: 0,
      initialStock: 0,
    },
    validators: {
      onSubmit: schema,
    },
    onSubmit: async ({ value }) => {
      setServerError(null);
      try {
        await createMutation.mutateAsync({ body: value });
        await queryClient.invalidateQueries({ queryKey: listProductsQueryKey() });
        form.reset();
        setOpen(false);
        toast.success(i18n._(productCreatedMsg));
      } catch (error) {
        setServerError(i18n._(problemMessage(error, catalogProblemMessages)));
      }
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          form.reset();
          setServerError(null);
        }
      }}
    >
      <DialogTrigger render={<Button type="button" />}>
        <Trans>Novo produto</Trans>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans>Novo produto</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>Cadastre um item no catálogo com SKU único e estoque inicial.</Trans>
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void form.handleSubmit();
          }}
        >
          {serverError !== null && (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {serverError}
            </p>
          )}

          <form.AppField name="sku">
            {(field) => <field.TextField label={<Trans>SKU</Trans>} placeholder="SKU-001" />}
          </form.AppField>

          <form.AppField name="name">
            {(field) => (
              <field.TextField label={<Trans>Nome</Trans>} placeholder={i18n._(namePlaceholderMsg)} />
            )}
          </form.AppField>

          <div className="grid grid-cols-2 gap-3">
            <form.AppField name="price">
              {(field) => <field.NumberField label={<Trans>Preço</Trans>} min={0} step="0.01" />}
            </form.AppField>

            <form.AppField name="initialStock">
              {(field) => <field.NumberField label={<Trans>Estoque inicial</Trans>} min={0} step="1" />}
            </form.AppField>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              <Trans>Cancelar</Trans>
            </Button>
            <form.AppForm>
              <form.SubmitButton label={<Trans>Salvar</Trans>} pendingLabel={<Trans>Salvando...</Trans>} />
            </form.AppForm>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
