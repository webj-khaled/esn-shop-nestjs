import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GetProductsQuery } from './dto/get-products.query';

@Injectable()
export class ProductsService {
  constructor(private readonly prismaService: PrismaService) {}

  async getProducts(query: GetProductsQuery) {
    const products = await this.prismaService.product.findMany({
      where: query.status
        ? { sold: query.status === 'unavailable' }
        : undefined,
      orderBy: { id: 'desc' },
    });
    return products.map((product) => this.toProductResponse(product));
  }

  async getProductById(id: number) {
    const product = await this.prismaService.product.findUnique({
      where: { id },
    });
    if (!product) {
      throw new NotFoundException('Product not found.');
    }
    return this.toProductResponse(product);
  }

  private toProductResponse(product: {
    id: number;
    name: string;
    description: string;
    price: number;
    imagePath: string | null;
  }) {
    return {
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.price,
      imageExists: Boolean(product.imagePath),
    };
  }
}
