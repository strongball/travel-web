import type { TodoItem } from '../../types/database'
import { supabase } from '../supabase'
import { asText } from './rowMappers'

export const fetchTodos = async (itineraryId?: string): Promise<TodoItem[]> => {
  let query = supabase.from('todo_items').select('*')
    .order('category', { ascending: true }).order('content', { ascending: true })
  if (itineraryId) query = query.eq('itinerary_id', itineraryId)
  const { data, error } = await query
  if (error) throw error
  return data.map((row) => ({
    id: asText(row.id),
    itineraryId: asText(row.itinerary_id),
    title: asText(row.content) || asText(row.title),
    isCompleted: Boolean(row.is_checked ?? row.is_completed),
    category: asText(row.category) || '其他',
    imagePath: typeof row.image_path === 'string' ? row.image_path : null,
    images: Array.isArray(row.images)
      ? row.images.filter((path: unknown): path is string => typeof path === 'string')
      : [],
  }))
}

export const saveTodo = async (todo: TodoItem): Promise<void> => {
  const { error } = await supabase.from('todo_items').upsert({
    id: todo.id,
    itinerary_id: todo.itineraryId,
    content: todo.title.trim(),
    is_checked: todo.isCompleted,
    category: todo.category,
    image_path: todo.imagePath,
    images: todo.images,
  })
  if (error) throw error
}

export const deleteTodo = async (id: string): Promise<void> => {
  const { error } = await supabase.from('todo_items').delete().eq('id', id)
  if (error) throw error
}
