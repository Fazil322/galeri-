
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Album, Photo } from '../types';
import { useAuth, useToast } from '../App';
import { Button, Input, Textarea, Spinner, TrashIcon, EditIcon, PlusIcon, LogoutIcon, StarIcon, CameraIcon, CloseIcon } from '../components/ui';

// --- Type for upload queue item ---
interface UploadableFile {
  id: string;
  file: File;
  previewUrl: string;
  status: 'queued' | 'uploading' | 'success' | 'error';
  error?: string;
}

// --- Reusable Admin Layout ---
const AdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const addToast = useToast();
    
    const handleLogout = async () => {
        const { error } = await supabase.auth.signOut();
        if (error) {
            addToast('Gagal logout: ' + error.message, 'error');
        } else {
            addToast('Anda berhasil logout.', 'success');
            navigate('/admin/login');
        }
    };

    return (
        <div className="min-h-screen bg-gray-100">
            <header className="bg-white shadow-sm">
                <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        <Link to="/admin" className="text-xl font-semibold text-gray-800">Admin Panel</Link>
                        <div className="flex items-center space-x-4">
                            <span className="text-sm text-gray-600 hidden sm:block">{user?.email}</span>
                            <Button onClick={handleLogout} variant="secondary" className="flex items-center space-x-2">
                                <LogoutIcon className="w-4 h-4" />
                                <span>Logout</span>
                            </Button>
                        </div>
                    </div>
                </div>
            </header>
            <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {children}
            </main>
        </div>
    );
};


// --- Admin Login Page ---
export const AdminLoginPage: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const { session } = useAuth();
    const addToast = useToast();

    useEffect(() => {
        if (session) {
            navigate('/admin');
        }
    }, [session, navigate]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
            addToast(error.message, 'error');
        } else {
            addToast('Login berhasil!', 'success');
            navigate('/admin');
        }
        setLoading(false);
    };
    
    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-100">
            <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md">
                <h2 className="text-2xl font-bold text-center text-gray-900">Admin Login</h2>
                <form onSubmit={handleLogin} className="space-y-6">
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
                        <Input type="email" id="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                    </div>
                    <div>
                        <label htmlFor="password" className="block text-sm font-medium text-gray-700">Password</label>
                        <Input type="password" id="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                    </div>
                    <Button type="submit" disabled={loading} className="w-full flex justify-center">
                        {loading ? <Spinner /> : 'Login'}
                    </Button>
                </form>
            </div>
        </div>
    );
};


// --- Admin Dashboard Page ---
export const AdminDashboardPage: React.FC = () => {
    const [albums, setAlbums] = useState<Album[]>([]);
    const [stats, setStats] = useState({ albumCount: 0, photoCount: 0 });
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const addToast = useToast();

    const fetchAlbumsAndStats = useCallback(async () => {
        setLoading(true);

        const albumsPromise = supabase.rpc('get_albums_with_photo_count');
        const photosCountPromise = supabase.from('photos').select('*', { count: 'exact', head: true });
        
        const [albumsResult, photosCountResult] = await Promise.all([albumsPromise, photosCountPromise]);

        const { data: albumsData, error: albumsError } = albumsResult;
        const { count: photoCount, error: photoError } = photosCountResult;

        if (albumsError) {
            addToast(`Gagal memuat album: ${albumsError.message}`, 'error');
            console.error('Error fetching albums for dashboard:', albumsError);
        } else if (albumsData) {
            setAlbums(albumsData as Album[]);
            setStats(prev => ({ ...prev, albumCount: albumsData.length }));
        }

        if (photoError) {
            addToast(`Gagal menghitung total foto: ${photoError.message}`, 'error');
            console.error('Error fetching photo count for dashboard:', photoError);
        } else {
            setStats(prev => ({ ...prev, photoCount: photoCount || 0 }));
        }

        setLoading(false);
    }, [addToast]);
    
    useEffect(() => {
        fetchAlbumsAndStats();
    }, [fetchAlbumsAndStats]);

    const handleDelete = async (albumId: string, albumTitle: string) => {
        if (window.confirm(`Apakah Anda yakin ingin menghapus album "${albumTitle}" beserta semua fotonya?`)) {
            // First, get all photo URLs to delete from storage
            const { data: photos, error: photosError } = await supabase.from('photos').select('image_url').eq('album_id', albumId);
            if (photosError) {
                addToast(`Gagal mendapatkan daftar foto: ${photosError.message}`, 'error');
                return;
            }

            // Delete from storage
            if (photos && photos.length > 0) {
                const filePaths = photos.map(p => p.image_url.split('/gallery/').pop() as string).filter(Boolean);
                if (filePaths.length > 0) {
                  const { error: storageError } = await supabase.storage.from('gallery').remove(filePaths);
                  if (storageError) {
                      addToast(`Gagal menghapus beberapa file: ${storageError.message}`, 'error');
                  }
                }
            }

            // Delete album from DB (photos will be deleted by cascade)
            const { error: dbError } = await supabase.from('albums').delete().eq('id', albumId);
            if (dbError) {
                addToast('Gagal menghapus album: ' + dbError.message, 'error');
            } else {
                addToast(`Album "${albumTitle}" berhasil dihapus.`, 'success');
                fetchAlbumsAndStats();
            }
        }
    };
    
    return (
        <AdminLayout>
            <h1 className="text-3xl font-bold text-gray-900 mb-6">Dashboard</h1>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="p-6 bg-white rounded-lg shadow"><p className="text-sm font-medium text-gray-500">Total Album</p><p className="mt-1 text-3xl font-semibold text-gray-900">{stats.albumCount}</p></div>
                <div className="p-6 bg-white rounded-lg shadow"><p className="text-sm font-medium text-gray-500">Total Foto</p><p className="mt-1 text-3xl font-semibold text-gray-900">{stats.photoCount}</p></div>
            </div>

            {/* Album List */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="p-6 flex justify-between items-center">
                    <h2 className="text-xl font-semibold">Manajemen Album</h2>
                    <Button onClick={() => navigate('/admin/album/new')} className="flex items-center space-x-2">
                        <PlusIcon className="w-4 h-4" />
                        <span>Tambah Album</span>
                    </Button>
                </div>
                {loading ? <div className="p-6 flex justify-center"><Spinner/></div> :
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Judul</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Jumlah Foto</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tanggal Dibuat</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {albums.map((album) => (
                                <tr key={album.id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{album.title}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{album.photo_count}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(album.created_at).toLocaleDateString('id-ID')}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                                        <Button variant="secondary" onClick={() => navigate(`/admin/album/${album.id}`)}><EditIcon className="w-4 h-4" /></Button>
                                        <Button variant="danger" onClick={() => handleDelete(album.id, album.title)}><TrashIcon className="w-4 h-4" /></Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>}
            </div>
        </AdminLayout>
    );
};


// --- Admin Album Editor Page ---
export const AdminAlbumEditorPage: React.FC = () => {
    const { albumId } = useParams<{ albumId?: string }>();
    const isNew = !albumId;
    const navigate = useNavigate();
    const addToast = useToast();
    
    const [album, setAlbum] = useState<Partial<Album>>({ title: '', description: '' });
    const [photos, setPhotos] = useState<Photo[]>([]);
    const [captions, setCaptions] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [filesToUpload, setFilesToUpload] = useState<UploadableFile[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fetchAlbumData = useCallback(async () => {
        if (isNew) return;
        setLoading(true);
        
        const { data: albumData, error: albumError } = await supabase.from('albums').select('*').eq('id', albumId).single();
        if (albumError) {
            addToast(`Gagal memuat data album: ${albumError.message}`, 'error');
            console.error("Error fetching album data:", albumError);
            navigate('/admin');
            return;
        }
        setAlbum(albumData);

        const { data: photosData, error: photosError } = await supabase.from('photos').select('*').eq('album_id', albumId).order('created_at', { ascending: true });
        if (photosError) {
            addToast(`Gagal memuat foto: ${photosError.message}`, 'error');
            console.error("Error fetching photos:", photosError);
            setPhotos([]);
        } else if (photosData) {
            setPhotos(photosData);
            const initialCaptions = photosData.reduce((acc, photo) => {
                acc[photo.id] = photo.caption || '';
                return acc;
            }, {} as Record<string, string>);
            setCaptions(initialCaptions);
        }
        
        setLoading(false);
    }, [albumId, isNew, navigate, addToast]);
    
    useEffect(() => {
        fetchAlbumData();
    }, [fetchAlbumData]);
    
    // Cleanup for Object URLs to prevent memory leaks
    useEffect(() => {
      return () => {
        filesToUpload.forEach(f => URL.revokeObjectURL(f.previewUrl));
      }
    }, [filesToUpload]);

    const handleAlbumSave = async () => {
        if (!album.title) {
            addToast('Judul album tidak boleh kosong.', 'error');
            return;
        }
        setSaving(true);
        if (isNew) {
            const { data, error } = await supabase.from('albums').insert({ title: album.title, description: album.description }).select().single();
            if (error) addToast('Gagal membuat album: ' + error.message, 'error');
            else {
                addToast('Album berhasil dibuat.', 'success');
                navigate(`/admin/album/${data.id}`);
            }
        } else {
            const captionUpdates = Object.keys(captions).map(photoId =>
                supabase.from('photos').update({ caption: captions[photoId] }).eq('id', photoId)
            );
            
            const [albumResult, ...captionResults] = await Promise.all([
                supabase.from('albums').update({ title: album.title, description: album.description }).eq('id', albumId),
                ...captionUpdates
            ]);
            
            if (albumResult.error || captionResults.some(r => r.error)) {
                 addToast('Gagal menyimpan perubahan.', 'error');
                 if(albumResult.error) console.error("Album update error:", albumResult.error);
            } else {
                 addToast('Perubahan berhasil disimpan.', 'success');
            }
        }
        setSaving(false);
    };

    const handleFileSelect = (selectedFiles: FileList | null) => {
      if (!selectedFiles) return;

      // FIX: Explicitly type the return of the map callback to `UploadableFile | null` to guide TypeScript's inference.
      const newFiles: UploadableFile[] = Array.from(selectedFiles).map((file): UploadableFile | null => {
          if (!file.type.startsWith('image/')) {
              addToast(`File ${file.name} bukan gambar.`, 'error');
              return null;
          }
          if (file.size > 5 * 1024 * 1024) { // 5MB limit
              addToast(`File ${file.name} terlalu besar (> 5MB).`, 'error');
              return null;
          }
          return {
              id: crypto.randomUUID(),
              file,
              previewUrl: URL.createObjectURL(file),
              status: 'queued',
          };
      }).filter((f): f is UploadableFile => f !== null);

      setFilesToUpload(prev => [...prev, ...newFiles]);
       if(fileInputRef.current) fileInputRef.current.value = "";
    };

    const removeFileFromQueue = (id: string) => {
      setFilesToUpload(prev => {
        const fileToRemove = prev.find(f => f.id === id);
        if (fileToRemove) {
          URL.revokeObjectURL(fileToRemove.previewUrl);
        }
        return prev.filter(f => f.id !== id);
      });
    };
    
    const handleUploadAll = async () => {
      if (!albumId) return;

      const filesToProcess = filesToUpload.filter(f => f.status === 'queued');
      if (filesToProcess.length === 0) {
        addToast('Tidak ada foto dalam antrean.', 'info');
        return;
      }
      
      // Set status to 'uploading'
      setFilesToUpload(prev => prev.map(f => f.status === 'queued' ? {...f, status: 'uploading'} : f));

      let successCount = 0;
      let errorCount = 0;

      for (const uploadableFile of filesToProcess) {
        try {
            const file = uploadableFile.file;
            const fileName = `${crypto.randomUUID()}-${file.name.replace(/\s/g, '_')}`;
            
            const { error: uploadError } = await supabase.storage.from('gallery').upload(fileName, file);
            if (uploadError) throw uploadError;

            const { data: urlData } = supabase.storage.from('gallery').getPublicUrl(fileName);
            const { error: insertError } = await supabase.from('photos').insert({ image_url: urlData.publicUrl, album_id: albumId });
            if (insertError) throw insertError;
            
            setFilesToUpload(prev => prev.map(f => f.id === uploadableFile.id ? {...f, status: 'success'} : f));
            successCount++;
        } catch (error: any) {
            errorCount++;
            setFilesToUpload(prev => prev.map(f => f.id === uploadableFile.id ? {...f, status: 'error', error: error.message} : f));
        }
      }

      if (successCount > 0) {
        addToast(`${successCount} foto berhasil diunggah.`, 'success');
        fetchAlbumData(); // Refresh photo list
      }
      if (errorCount > 0) {
        addToast(`${errorCount} foto gagal diunggah.`, 'error');
      }
      // Clear successful uploads from queue after a delay
      setTimeout(() => {
        setFilesToUpload(prev => prev.filter(f => f.status !== 'success'));
      }, 3000);
    };

    // Drag and drop handlers
    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(true);
    };
    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
    };
    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      handleFileSelect(e.dataTransfer.files);
    };

    const handleDeletePhoto = async (photo: Photo) => {
        if (window.confirm('Anda yakin ingin menghapus foto ini?')) {
            const filePath = photo.image_url.split('/gallery/').pop();
            if(!filePath) {
                 addToast('URL foto tidak valid.', 'error');
                 return;
            }

            const { error: storageError } = await supabase.storage.from('gallery').remove([filePath]);
            if (storageError) {
                addToast('Gagal menghapus file dari storage: ' + storageError.message, 'error');
                return;
            }
            
            const { error: dbError } = await supabase.from('photos').delete().eq('id', photo.id);
            if (dbError) {
                addToast('Gagal menghapus data foto: ' + dbError.message, 'error');
            } else {
                addToast('Foto berhasil dihapus.', 'success');
                if (album.cover_image_url === photo.image_url) {
                    await supabase.from('albums').update({ cover_image_url: null }).eq('id', album.id as string);
                }
                fetchAlbumData();
            }
        }
    }
    
    const handleSetCover = async (photoUrl: string) => {
        const { error } = await supabase.from('albums').update({ cover_image_url: photoUrl }).eq('id', albumId as string);
        if (error) {
            addToast(`Gagal mengatur foto sampul: ${error.message}`, 'error');
        } else {
            addToast('Foto sampul berhasil diperbarui.', 'success');
            setAlbum(prev => ({ ...prev, cover_image_url: photoUrl }));
        }
    };
    
    const isUploading = filesToUpload.some(f => f.status === 'uploading');

    if (loading) {
        return <AdminLayout><div className="flex justify-center"><Spinner /></div></AdminLayout>
    }

    return (
        <AdminLayout>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-gray-900">{isNew ? 'Tambah Album Baru' : 'Edit Album'}</h1>
                <Button onClick={handleAlbumSave} disabled={saving}>
                    {saving ? <Spinner /> : (isNew ? 'Buat Album' : 'Simpan Perubahan')}
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Album Details Form */}
                <div className="lg:col-span-1 bg-white p-6 rounded-lg shadow space-y-4 h-fit">
                     <h2 className="text-xl font-semibold">Detail Album</h2>
                     <div>
                        <label className="block text-sm font-medium text-gray-700">Judul</label>
                        <Input value={album.title || ''} onChange={(e) => setAlbum({...album, title: e.target.value})} />
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700">Deskripsi</label>
                        <Textarea rows={4} value={album.description || ''} onChange={(e) => setAlbum({...album, description: e.target.value})} />
                     </div>
                </div>

                {/* Photo Management */}
                <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow">
                    <h2 className="text-xl font-semibold mb-4">Manajemen Foto</h2>
                    {!isNew ? (
                        <>
                        <div 
                          className={`border-2 border-dashed rounded-lg p-6 text-center mb-6 transition-colors ${isDragging ? 'border-brand-blue-500 bg-brand-blue-50' : 'border-gray-300'}`}
                          onDragOver={handleDragOver}
                          onDragLeave={handleDragLeave}
                          onDrop={handleDrop}
                        >
                            <input type="file" multiple onChange={(e) => handleFileSelect(e.target.files)} ref={fileInputRef} className="hidden" id="photo-upload" accept="image/*" />
                            <label htmlFor="photo-upload" className="cursor-pointer text-brand-blue-600 font-semibold flex flex-col items-center justify-center space-y-2">
                                <CameraIcon className="w-12 h-12 text-gray-400" />
                                <span>{isDragging ? 'Jatuhkan file di sini' : 'Pilih file atau jatuhkan ke sini'}</span>
                                <span className="text-xs text-gray-500">Maks 5MB per file</span>
                            </label>
                        </div>
                        
                        {/* Upload Queue */}
                        {filesToUpload.length > 0 && (
                          <div className="mb-6">
                            <h3 className="font-semibold text-lg mb-2">Antrean Unggah ({filesToUpload.filter(f => f.status === 'queued').length})</h3>
                            <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                              {filesToUpload.map(f => (
                                <div key={f.id} className="flex items-center p-2 bg-gray-50 rounded-md">
                                  <img src={f.previewUrl} alt={f.file.name} className="w-12 h-12 object-cover rounded-md mr-3" />
                                  <div className="flex-grow">
                                    <p className="text-sm font-medium truncate">{f.file.name}</p>
                                    <p className="text-xs text-gray-500">{(f.file.size / 1024 / 1024).toFixed(2)} MB</p>
                                    {f.status === 'error' && <p className="text-xs text-red-500 truncate" title={f.error}>{f.error}</p>}
                                  </div>
                                  <div className="flex items-center space-x-2 ml-2">
                                    {f.status === 'queued' && <span className="text-xs font-semibold text-gray-500">Menunggu</span>}
                                    {f.status === 'uploading' && <Spinner />}
                                    {f.status === 'success' && <span className="text-xs font-semibold text-green-500">Berhasil</span>}
                                    {f.status === 'error' && <span className="text-xs font-semibold text-red-500">Gagal</span>}
                                    <button onClick={() => removeFileFromQueue(f.id)} disabled={f.status === 'uploading'} className="p-1 text-gray-500 hover:text-red-600 disabled:opacity-50"><CloseIcon className="w-4 h-4" /></button>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <Button onClick={handleUploadAll} disabled={isUploading || filesToUpload.filter(f => f.status === 'queued').length === 0} className="w-full mt-4">
                              {isUploading ? <Spinner/> : `Unggah ${filesToUpload.filter(f => f.status === 'queued').length} Foto`}
                            </Button>
                          </div>
                        )}

                        <h3 className="font-semibold text-lg mb-2 mt-4">Foto Tersimpan</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                            {photos.map(photo => (
                                <div key={photo.id} className="relative group bg-gray-100 rounded-md overflow-hidden">
                                    <img src={`${photo.image_url}?width=200&height=200`} alt={photo.caption || ''} className="w-full h-32 object-cover" />
                                    <div className="absolute top-1 right-1 flex flex-col space-y-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => handleDeletePhoto(photo)} className="p-1.5 bg-red-600 text-white rounded-full shadow-md hover:bg-red-700"><TrashIcon className="w-4 h-4" /></button>
                                        <button onClick={() => handleSetCover(photo.image_url)} className="p-1.5 bg-yellow-500 text-white rounded-full shadow-md hover:bg-yellow-600">
                                            <StarIcon className="w-4 h-4" solid={album.cover_image_url === photo.image_url} />
                                        </button>
                                    </div>
                                    <input 
                                        type="text"
                                        placeholder="Tambah caption..."
                                        value={captions[photo.id] || ''}
                                        onChange={(e) => setCaptions({...captions, [photo.id]: e.target.value})}
                                        className="w-full text-xs p-1 border-t"
                                    />
                                </div>
                            ))}
                        </div>
                        </>
                    ) : (
                        <p className="text-gray-500 text-center p-8">Simpan album terlebih dahulu untuk dapat mengunggah foto.</p>
                    )}
                </div>
            </div>
        </AdminLayout>
    );
};