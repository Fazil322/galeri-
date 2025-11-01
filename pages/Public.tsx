import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Album, Photo } from '../types';
import { Modal, Spinner, ChevronLeftIcon, ChevronRightIcon, CameraIcon } from '../components/ui';

// --- Reusable Layout Components ---
const PublicHeader = () => (
    <header className="bg-brand-blue-800 text-white shadow-md">
        <nav className="container mx-auto px-6 py-4 flex justify-between items-center">
            <Link to="/" className="text-xl md:text-2xl font-bold">SMK LPPMRI 2 KEDUNGREJA</Link>
            <Link to="/" className="text-lg hover:text-brand-blue-200 transition-colors">Galeri</Link>
        </nav>
    </header>
);

const PublicFooter = () => (
    <footer className="bg-gray-800 text-white mt-auto">
        <div className="container mx-auto px-6 py-4 text-center">
            <p>&copy; {new Date().getFullYear()} SMK LPPMRI 2 KEDUNGREJA. Seluruh hak cipta dilindungi.</p>
        </div>
    </footer>
);

const PageLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="min-h-screen flex flex-col bg-gray-50 text-gray-800">
        <PublicHeader />
        <main className="flex-grow container mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
        </main>
        <PublicFooter />
    </div>
);

// --- Photo Lightbox Component ---
interface PhotoLightboxProps {
    photos: Photo[];
    startIndex: number;
    onClose: () => void;
}
const PhotoLightbox: React.FC<PhotoLightboxProps> = ({ photos, startIndex, onClose }) => {
    const [currentIndex, setCurrentIndex] = useState(startIndex);

    const goToPrevious = useCallback(() => {
        setCurrentIndex((prevIndex) => (prevIndex === 0 ? photos.length - 1 : prevIndex - 1));
    }, [photos.length]);

    const goToNext = useCallback(() => {
        setCurrentIndex((prevIndex) => (prevIndex === photos.length - 1 ? 0 : prevIndex + 1));
    }, [photos.length]);
    
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') goToPrevious();
            if (e.key === 'ArrowRight') goToNext();
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [goToPrevious, goToNext, onClose]);

    const photo = photos[currentIndex];
    if (!photo) return null;

    return (
        <Modal isOpen={true} onClose={onClose}>
            <div className="relative">
                <img src={photo.image_url} alt={photo.caption || 'Foto kegiatan'} className="max-h-[75vh] w-full object-contain rounded-md" />
                {photo.caption && <p className="text-center text-white mt-3 bg-black bg-opacity-50 p-2 rounded-md">{photo.caption}</p>}
                
                <button onClick={goToPrevious} className="absolute left-2 top-1/2 -translate-y-1/2 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-75 transition-all">
                    <ChevronLeftIcon className="w-6 h-6" />
                </button>
                <button onClick={goToNext} className="absolute right-2 top-1/2 -translate-y-1/2 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-75 transition-all">
                    <ChevronRightIcon className="w-6 h-6" />
                </button>
            </div>
        </Modal>
    );
};

// --- Home Page ---
export const PublicHomePage: React.FC = () => {
    const [albums, setAlbums] = useState<Album[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAlbums = async () => {
            setLoading(true);
            const { data, error } = await supabase.rpc('get_albums_with_photo_count');
            
            if (error) {
                console.error('Error fetching albums:', error.message, error);
            } else if (data) {
                setAlbums(data as Album[]);
            }
            setLoading(false);
        };
        fetchAlbums();
    }, []);

    return (
        <PageLayout>
            <section className="text-center mb-12">
                <h1 className="text-4xl md:text-5xl font-extrabold text-brand-blue-800">Galeri Kegiatan Kami</h1>
                <p className="mt-4 text-lg text-gray-600">Dokumentasi momen-momen berharga di SMK LPPMRI 2 KEDUNGREJA.</p>
            </section>
            
            {loading ? (
                <div className="flex justify-center"><Spinner /></div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                    {albums.map((album) => (
                        <Link key={album.id} to={`/gallery/${album.id}`} className="group block bg-white rounded-lg shadow-md overflow-hidden transform hover:-translate-y-1 transition-all duration-300">
                           <div className="relative pb-[75%]">
                                {album.cover_image_url ? (
                                    <img src={`${album.cover_image_url}?width=400&height=300`} alt={album.title} className="absolute h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                                ) : (
                                    <div className="absolute h-full w-full bg-gray-200 flex items-center justify-center">
                                        <CameraIcon className="w-16 h-16 text-gray-400" />
                                    </div>
                                )}
                           </div>
                           <div className="p-4">
                                <h3 className="font-bold text-lg text-gray-900 truncate">{album.title}</h3>
                                <div className="text-sm text-gray-500 mt-2 flex justify-between">
                                    <span>{new Date(album.created_at).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                                    <span>{album.photo_count} Foto</span>
                                </div>
                           </div>
                        </Link>
                    ))}
                </div>
            )}
        </PageLayout>
    );
};

// --- Album Detail Page ---
export const AlbumDetailPage: React.FC = () => {
    const { albumId } = useParams<{ albumId: string }>();
    const [album, setAlbum] = useState<Album | null>(null);
    const [photos, setPhotos] = useState<Photo[]>([]);
    const [loading, setLoading] = useState(true);
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);

    useEffect(() => {
        const fetchAlbumDetails = async () => {
            if (!albumId) return;
            setLoading(true);

            // Fetch album details
            const { data: albumData, error: albumError } = await supabase
                .from('albums')
                .select('*')
                .eq('id', albumId)
                .single();

            if (albumError) console.error('Error fetching album:', albumError.message, albumError);
            else setAlbum(albumData);

            // Fetch photos
            const { data: photosData, error: photosError } = await supabase
                .from('photos')
                .select('*')
                .eq('album_id', albumId)
                .order('created_at', { ascending: true });
            
            if (photosError) console.error('Error fetching photos:', photosError.message, photosError);
            else setPhotos(photosData);

            setLoading(false);
        };
        fetchAlbumDetails();
    }, [albumId]);

    const openLightbox = (index: number) => {
        setSelectedPhotoIndex(index);
        setLightboxOpen(true);
    };

    if (loading) {
        return <PageLayout><div className="flex justify-center"><Spinner /></div></PageLayout>;
    }

    if (!album) {
        return <PageLayout><p>Album tidak ditemukan.</p></PageLayout>;
    }

    return (
        <PageLayout>
            <section className="mb-10">
                <h1 className="text-3xl md:text-4xl font-bold text-gray-900">{album.title}</h1>
                {album.description && <p className="mt-2 text-gray-600 max-w-3xl">{album.description}</p>}
            </section>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {photos.map((photo, index) => (
                    <div key={photo.id} className="cursor-pointer group relative" onClick={() => openLightbox(index)}>
                       <img 
                            src={`${photo.image_url}?width=400&height=400`}
                            alt={photo.caption || `Foto ${index + 1}`}
                            className="w-full h-full object-cover rounded-lg shadow-md aspect-square"
                        />
                       <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all duration-300 flex items-center justify-center">
                           <p className="text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300 px-4 text-center">{photo.caption}</p>
                       </div>
                    </div>
                ))}
            </div>

            {lightboxOpen && (
                <PhotoLightbox
                    photos={photos}
                    startIndex={selectedPhotoIndex}
                    onClose={() => setLightboxOpen(false)}
                />
            )}
        </PageLayout>
    );
};