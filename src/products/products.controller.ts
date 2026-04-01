import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { GetProductsQuery } from './dto/get-products.query';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  getProducts(@Query() query: GetProductsQuery) {
    return this.productsService.getProducts(query);
  }

  @Get(':id')
  getProductById(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.getProductById(id);
  }
}
