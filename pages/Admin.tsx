import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Album, Photo } from '../types';
import { useAuth, useToast } from '../App';
import { Button, Input, Textarea, Spinner, TrashIcon, EditIcon, PlusIcon, LogoutIcon, StarIcon, CameraIcon } from '../components/ui';

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
                const filePaths = photos.map(p => p.image_url.split('/').pop() as string).filter(Boolean);
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
    const [uploading, setUploading] = useState(false);
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

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0 || !albumId) return;

        setUploading(true);
        const uploadPromises = Array.from(files).map(async (file: File) => {
            const fileName = `${Date.now()}-${file.name.replace(/\s/g, '_')}`;
            const { error: uploadError } = await supabase.storage.from('gallery').upload(fileName, file);
            if (uploadError) throw uploadError;

            const { data: urlData } = supabase.storage.from('gallery').getPublicUrl(fileName);
            return { image_url: urlData.publicUrl, album_id: albumId };
        });

        try {
            const newPhotosData = await Promise.all(uploadPromises);
            const { error: insertError } = await supabase.from('photos').insert(newPhotosData);
            if (insertError) throw insertError;

            addToast(`${files.length} foto berhasil diunggah.`, 'success');
            fetchAlbumData(); // Refresh photos
        } catch (error) {
            let errorMessage = 'Terjadi kesalahan yang tidak diketahui';
            if (error instanceof Error) {
                errorMessage = error.message;
            } else if (error && typeof error === 'object' && 'message' in error) {
                errorMessage = String((error as { message: unknown }).message);
            }
            addToast('Gagal mengunggah foto: ' + errorMessage, 'error');
        } finally {
            setUploading(false);
            if(fileInputRef.current) fileInputRef.current.value = "";
        }
    };
    
    const handleDeletePhoto = async (photo: Photo) => {
        if (window.confirm('Anda yakin ingin menghapus foto ini?')) {
            const filePath = photo.image_url.split('/').pop();
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
                        <Input value={album.title} onChange={(e) => setAlbum({...album, title: e.target.value})} />
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
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center mb-6">
                            <input type="file" multiple onChange={handleFileUpload} ref={fileInputRef} className="hidden" id="photo-upload" />
                            <label htmlFor="photo-upload" className="cursor-pointer text-brand-blue-600 font-semibold">
                                {uploading ? 'Mengunggah...' : 'Pilih atau jatuhkan file untuk diunggah'}
                            </label>
                            {uploading && <div className="mt-4 flex justify-center"><Spinner /></div>}
                        </div>
                        
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