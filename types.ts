
import { PostgrestError } from '@supabase/supabase-js';

export interface Album {
  id: string;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  created_at: string;
  photo_count?: number;
}

export interface Photo {
  id: string;
  album_id: string;
  image_url: string;
  caption: string | null;
  created_at: string;
}

export interface ToastMessage {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}
