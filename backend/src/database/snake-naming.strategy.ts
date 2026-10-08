import { DefaultNamingStrategy, type NamingStrategyInterface } from 'typeorm';

const snake = (value: string): string =>
  value
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z\d]+)/g, '$1_$2')
    .toLowerCase();

/** snake_case tables and columns (`createdAt` → `created_at`) so SQL reads naturally. */
export class SnakeNamingStrategy extends DefaultNamingStrategy implements NamingStrategyInterface {
  override tableName(className: string, customName?: string): string {
    return customName ?? snake(className.replace(/Entity$/, ''));
  }

  override columnName(propertyName: string, customName: string | undefined, embeddedPrefixes: string[]): string {
    return snake(embeddedPrefixes.concat(customName ?? propertyName).join('_'));
  }

  override relationName(propertyName: string): string {
    return snake(propertyName);
  }

  override joinColumnName(relationName: string, referencedColumnName: string): string {
    return snake(`${relationName}_${referencedColumnName}`);
  }

  override joinTableName(firstTableName: string, secondTableName: string, firstPropertyName: string): string {
    return snake(`${firstTableName}_${firstPropertyName.replace(/\./g, '_')}_${secondTableName}`);
  }

  override joinTableColumnName(tableName: string, propertyName: string, columnName?: string): string {
    return snake(`${tableName}_${columnName ?? propertyName}`);
  }
}
