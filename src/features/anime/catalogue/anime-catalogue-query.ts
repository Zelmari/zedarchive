import { z } from 'zod'
import { animeCatalogueItemSchema } from '@/features/anime/domain/anime-catalogue-item'

const animeCataloguePageNumberSchema = z.number().int().min(1).max(10_000)

const animeCataloguePageSizeSchema = z.number().int().min(1).max(48)

const animeCatalogueSearchQuerySchema = z
  .string()
  .transform((value) => value.trim().replace(/\s+/gu, ' '))
  .pipe(z.string().min(1).max(200))

const animeCatalogueBrowsePaginationFields = {
  page: animeCataloguePageNumberSchema.default(1),
  pageSize: animeCataloguePageSizeSchema.default(24),
} as const

export const animeCatalogueBrowseRequestSchema = z.strictObject(
  animeCatalogueBrowsePaginationFields,
)

export const animeCatalogueSearchRequestSchema = z.strictObject({
  query: animeCatalogueSearchQuerySchema,
  ...animeCatalogueBrowsePaginationFields,
})

export const animeCataloguePaginationSchema = z
  .strictObject({
    page: animeCataloguePageNumberSchema,
    pageSize: animeCataloguePageSizeSchema,
    totalItems: z.number().int().min(0),
    totalPages: z.number().int().min(0),
    hasPreviousPage: z.boolean(),
    hasNextPage: z.boolean(),
  })
  .superRefine((pagination, context) => {
    const expectedTotalPages =
      pagination.totalItems === 0
        ? 0
        : Math.ceil(pagination.totalItems / pagination.pageSize)
    const expectedHasPreviousPage =
      pagination.page > 1 && expectedTotalPages > 0
    const expectedHasNextPage = pagination.page < expectedTotalPages

    if (pagination.totalPages !== expectedTotalPages) {
      context.addIssue({
        code: 'custom',
        path: ['totalPages'],
        message: 'Total pages must match the item count and page size',
      })
    }

    if (pagination.hasPreviousPage !== expectedHasPreviousPage) {
      context.addIssue({
        code: 'custom',
        path: ['hasPreviousPage'],
        message: 'Previous-page availability is inconsistent',
      })
    }

    if (pagination.hasNextPage !== expectedHasNextPage) {
      context.addIssue({
        code: 'custom',
        path: ['hasNextPage'],
        message: 'Next-page availability is inconsistent',
      })
    }
  })

export const animeCataloguePageSchema = z.strictObject({
  items: z.array(animeCatalogueItemSchema),
  pagination: animeCataloguePaginationSchema,
})

export type AnimeCatalogueBrowseRequest = z.infer<
  typeof animeCatalogueBrowseRequestSchema
>

export type AnimeCatalogueSearchRequest = z.infer<
  typeof animeCatalogueSearchRequestSchema
>

export type AnimeCataloguePagination = z.infer<
  typeof animeCataloguePaginationSchema
>

export type AnimeCataloguePage = z.infer<typeof animeCataloguePageSchema>
